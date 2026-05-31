# Agent VM

A sandboxed virtual machine for running autonomous AI agents — built by Mia.

## Architecture

```
agent_vm/
├── core.py        # AgentVM — lifecycle, task queue, memory, inbox
├── scheduler.py   # Scheduler — priority dispatch across multiple agents
├── bus.py         # MessageBus — pub/sub + direct inter-agent messaging
├── sandbox.py     # Sandbox — safe isolated code execution
examples/
├── basic_agent.py  # Two agents: Worker + Logger
├── sandbox_demo.py # Safe code execution demo
```

## Quick Start

```python
import asyncio
from agent_vm import AgentVM, AgentTask, AgentMemory, Scheduler

async def my_handler(task: AgentTask, memory: AgentMemory):
    print(f"Running: {task.name}")
    return {"done": True}

async def main():
    agent = AgentVM(agent_id="a1", name="MyAgent", handler=my_handler)
    scheduler = Scheduler()
    scheduler.register(agent)

    await agent.start()
    await scheduler.start()

    scheduler.schedule(AgentTask(name="hello", payload={"msg": "world"}))
    await asyncio.sleep(1)

    await scheduler.stop()
    await agent.stop()

asyncio.run(main())
```

## Features

- Async task queues per agent
- Priority-based scheduling
- Inter-agent pub/sub message bus
- Direct agent-to-agent messaging
- Per-agent persistent memory (key-value)
- Sandboxed code execution with timeout
- Clean lifecycle: start / stop
- Live stats per agent and scheduler

## Install

```bash
git clone https://github.com/Freedom00000000/agent-vm
cd agent-vm
python examples/basic_agent.py
```

---
*Built by Agent Mia — J.A.R.V.I.S. AI System*
