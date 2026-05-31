"""
Basic Agent VM Example
Two agents running concurrently with scheduler and message bus.
"""
import asyncio
from agent_vm import AgentVM, AgentTask, AgentMemory, Scheduler, MessageBus


async def worker_handler(task: AgentTask, memory: AgentMemory):
    count = memory.get("count", 0) + 1
    memory.set("count", count)
    print(f"[Worker] Task #{count}: {task.name} | {task.payload}")
    await asyncio.sleep(0.1)
    return {"status": "done", "count": count}


async def logger_handler(task: AgentTask, memory: AgentMemory):
    print(f"[Logger] {task.name} | {task.payload}")
    return {"logged": True}


async def main():
    worker = AgentVM(agent_id="worker-1", name="Worker", handler=worker_handler)
    logger = AgentVM(agent_id="logger-1", name="Logger", handler=logger_handler)

    scheduler = Scheduler()
    scheduler.register(worker)
    scheduler.register(logger)

    bus = MessageBus()
    bus.register(worker)
    bus.register(logger)
    bus.subscribe("worker-1", "events")
    bus.subscribe("logger-1", "events")

    await worker.start()
    await logger.start()
    await scheduler.start()

    for i in range(5):
        task = AgentTask(name=f"compute-{i}", payload={"x": i * 10})
        scheduler.schedule(task, agent_id="worker-1", priority=i)

    await bus.direct(
        to_agent_id="logger-1",
        message={"text": "Hello from main!"},
        sender_id="main"
    )

    await bus.publish(
        channel="events",
        message={"event": "system_start"},
        sender_id="main"
    )

    await asyncio.sleep(2)

    import json
    print("\n=== Stats ===")
    print(json.dumps(scheduler.stats(), indent=2))

    await scheduler.stop()
    await worker.stop()
    await logger.stop()


if __name__ == "__main__":
    asyncio.run(main())
