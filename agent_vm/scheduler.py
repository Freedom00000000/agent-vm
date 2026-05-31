"""Agent VM — Task Scheduler
Priority-based task scheduling across multiple Agent VMs.
"""

import asyncio
import heapq
import time
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from agent_vm.core import AgentVM, AgentTask


@dataclass(order=True)
class ScheduledTask:
    priority: int
    created_at: float
    task: AgentTask = field(compare=False)
    agent_id: str = field(compare=False)


class Scheduler:
    """
    Central task scheduler for distributing tasks across registered agents.
    Supports priority queues, round-robin, and agent-specific routing.
    """

    def __init__(self):
        self._agents: Dict[str, AgentVM] = {}
        self._heap: List[ScheduledTask] = []
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def register(self, agent: AgentVM):
        self._agents[agent.agent_id] = agent
        print(f"[Scheduler] Registered agent: {agent.name} ({agent.agent_id})")

    def unregister(self, agent_id: str):
        self._agents.pop(agent_id, None)

    def schedule(self, task: AgentTask, agent_id: Optional[str] = None, priority: int = 5):
        """
        Schedule a task. If agent_id is specified, route to that agent.
        Otherwise, dispatcher picks the least-loaded agent.
        """
        target = agent_id or self._pick_agent()
        if not target:
            raise ValueError("No agents registered.")
        scheduled = ScheduledTask(
            priority=-priority,  # heapq is min-heap, so negate for max priority
            created_at=time.time(),
            task=task,
            agent_id=target
        )
        heapq.heappush(self._heap, scheduled)
        print(f"[Scheduler] Queued task '{task.name}' → agent {target} (priority={priority})")

    def _pick_agent(self) -> Optional[str]:
        """Pick the agent with the smallest task queue."""
        if not self._agents:
            return None
        return min(
            self._agents.values(),
            key=lambda a: a.task_queue.qsize()
        ).agent_id

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._dispatch_loop())
        print("[Scheduler] Started.")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        print("[Scheduler] Stopped.")

    async def _dispatch_loop(self):
        while self._running:
            if self._heap:
                scheduled = heapq.heappop(self._heap)
                agent = self._agents.get(scheduled.agent_id)
                if agent:
                    await agent.submit(scheduled.task)
            await asyncio.sleep(0.05)

    def stats(self) -> Dict:
        return {
            "registered_agents": len(self._agents),
            "queued_tasks": len(self._heap),
            "agents": [a.stats() for a in self._agents.values()]
        }
