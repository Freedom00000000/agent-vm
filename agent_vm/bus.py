"""Agent VM — Message Bus
Inter-agent communication channel (pub/sub + direct messaging).
"""

import asyncio
from typing import Callable, Dict, List, Optional
from agent_vm.core import AgentVM


class MessageBus:
    """
    Pub/Sub message bus for inter-agent communication.
    Agents can publish to channels and subscribe to receive messages.
    Also supports direct agent-to-agent messaging.
    """

    def __init__(self):
        self._agents: Dict[str, AgentVM] = {}
        self._subscriptions: Dict[str, List[str]] = {}  # channel -> [agent_ids]
        self._handlers: Dict[str, Callable] = {}  # channel -> handler fn

    def register(self, agent: AgentVM):
        self._agents[agent.agent_id] = agent

    def subscribe(self, agent_id: str, channel: str):
        """Subscribe an agent to a named channel."""
        if channel not in self._subscriptions:
            self._subscriptions[channel] = []
        if agent_id not in self._subscriptions[channel]:
            self._subscriptions[channel].append(agent_id)
        print(f"[Bus] Agent {agent_id} subscribed to channel '{channel}'")

    def unsubscribe(self, agent_id: str, channel: str):
        if channel in self._subscriptions:
            self._subscriptions[channel] = [
                a for a in self._subscriptions[channel] if a != agent_id
            ]

    async def publish(self, channel: str, message: Dict, sender_id: Optional[str] = None):
        """Broadcast a message to all subscribers of a channel."""
        recipients = self._subscriptions.get(channel, [])
        payload = {"channel": channel, "from": sender_id, "data": message}
        tasks = []
        for agent_id in recipients:
            if agent_id == sender_id:
                continue  # don't echo to sender
            agent = self._agents.get(agent_id)
            if agent:
                tasks.append(agent.send_message(payload))
        if tasks:
            await asyncio.gather(*tasks)
        print(f"[Bus] Published to '{channel}': {len(tasks)} recipient(s)")

    async def direct(self, to_agent_id: str, message: Dict, sender_id: Optional[str] = None):
        """Send a direct message to a specific agent."""
        agent = self._agents.get(to_agent_id)
        if not agent:
            raise ValueError(f"Agent {to_agent_id} not found on bus.")
        payload = {"direct": True, "from": sender_id, "data": message}
        await agent.send_message(payload)
        print(f"[Bus] Direct message from {sender_id} → {to_agent_id}")

    def channels(self) -> Dict:
        return {ch: agents for ch, agents in self._subscriptions.items()}
