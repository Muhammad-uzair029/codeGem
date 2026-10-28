---
title: LangChain vs LangGraph vs CrewAI
summary: Three popular agent frameworks solve different problems; pick by how much control you need over the flow.
minutes: 10
practice: [agent-frameworks-1, agent-frameworks-2, agent-frameworks-3]
selfCheck:
  - q: Which framework models an app as a graph of nodes sharing state, with explicit edges and checkpoints?
    options:
      - LangGraph
      - CrewAI
      - A plain prompt template
    answer: 0
    why: LangGraph builds a StateGraph of nodes and (conditional) edges, and can persist state with a checkpointer.
  - q: CrewAI's core abstraction is...
    options:
      - Vector stores and retrievers
      - Role-playing agents (role, goal, backstory) that work through tasks as a crew
      - A JSON-RPC protocol for tools
    answer: 1
    why: CrewAI organizes work as Agents with roles, Tasks with expected outputs, and a Crew that runs them in a process.
  - q: When is "no framework" a reasonable choice?
    options:
      - Never; frameworks are required for tool calling
      - When the app is a simple loop or workflow and you want full control and fewer dependencies
      - Only for prototypes
    answer: 1
    why: A tool-calling loop is a few dozen lines with a provider SDK. Frameworks pay off when you need their extra features.
---

## Core concepts

These frameworks change fast, so focus on **what each is for**, not on specific function names that may be renamed next release.

**LangChain**: a broad toolkit of building blocks: model wrappers for many providers, prompt templates, output parsers, retrievers, document loaders, and ready-made agent constructors. Think of it as a big box of LEGO parts with a standard connector between them. Its strength is integrations and getting started quickly.

**LangGraph**: from the same team, but lower-level and focused on **control**. You describe your app as a **graph**: nodes are functions (often LLM calls or tools), edges say what runs next, and conditional edges let the model's output choose the branch. A shared **state** object flows through the graph. It adds **checkpointing** (save state after each step), which enables pause and resume, **human-in-the-loop** approval, and long-running agents. Think of it as a flowchart that actually runs.

**CrewAI**: a higher-level framework built around a team metaphor. You define **Agents** with a role, goal and backstory, **Tasks** with a description and expected output, and a **Crew** that runs them, either **sequentially** or **hierarchically** with a manager agent delegating. Think of it as staffing a small team and handing out assignments.

Rough guide:

| You need… | Good fit |
|---|---|
| Lots of provider/vector-store integrations, simple chains, RAG | LangChain |
| Precise control of loops, branches, retries, persistence, human approval | LangGraph |
| Fast multi-agent prototype expressed as roles and tasks | CrewAI |
| A simple loop, minimal dependencies, total control | Provider SDK, no framework |

None of these is "the best". They sit at different levels of abstraction: higher level means faster to start but harder to bend when your needs don't match its model.

## How it works in real systems

LangGraph: a two-node agent that loops until the model stops calling tools. `ToolNode` and `tools_condition` are prebuilt helpers.

```python
from langgraph.graph import StateGraph, MessagesState, START
from langgraph.prebuilt import ToolNode, tools_condition

llm_with_tools = llm.bind_tools(tools)       # any LangChain chat model

def agent(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

g = StateGraph(MessagesState)
g.add_node("agent", agent)
g.add_node("tools", ToolNode(tools))
g.add_edge(START, "agent")
g.add_conditional_edges("agent", tools_condition)  # to "tools" or END
g.add_edge("tools", "agent")
app = g.compile()

app.invoke({"messages": [("user", "Summarize open P1 incidents")]},
           config={"recursion_limit": 10})       # hard cap on steps
```

CrewAI: two agents in a sequential process.

```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(role="Researcher", goal="Find accurate facts about {topic}",
                   backstory="A careful analyst who cites sources.", tools=[search_tool])
writer = Agent(role="Writer", goal="Write a clear 300-word brief",
               backstory="A technical writer for busy engineers.")

research = Task(description="Research {topic}.", expected_output="Bullet facts with links",
                agent=researcher)
brief = Task(description="Write the brief from the research.",
             expected_output="A 300-word brief", agent=writer)

crew = Crew(agents=[researcher, writer], tasks=[research, brief], process=Process.sequential)
result = crew.kickoff(inputs={"topic": "MCP adoption"})
```

How teams actually choose:

- **Prototype** in whatever gets a demo working, then ask: "Do I understand every step this framework takes for me?"
- **Production** usually wants explicit control, observability, and testability. That pushes toward LangGraph or plain code.
- **Mixing is normal**: e.g. LangChain model wrappers and retrievers inside LangGraph nodes.

> [!warning] Pin your versions
> All three have had breaking API changes. Pin versions, read the changelog before upgrading, and keep your own code behind a thin interface so swapping frameworks isn't a rewrite.

## Common mistakes

- Picking a framework because it's popular → pick by the control and features you need.
- Using a multi-agent framework for a single-step task → a single prompt or tool call is cheaper and easier to test.
- Treating the framework as a black box → turn on tracing and read what prompts it actually sends.
- Copying tutorials written for an older major version → check the version the docs target.
- Business logic tangled into framework classes → keep it in plain functions the framework calls.

## Interview angle

Asked as: *"Have you used LangChain? Why or why not?"* or *"LangGraph vs CrewAI?"* Interviewers aren't looking for loyalty; they want trade-off thinking. A strong answer places each tool on the abstraction ladder (CrewAI high level, LangChain components, LangGraph low-level orchestration, raw SDK lowest), names a real reason for your choice (persistence and human approval, integrations, speed of prototyping), and admits the costs (abstraction leaks, upgrade churn, debugging hidden prompts).

Follow-up: *"When would you drop the framework entirely?"* When the flow is simple, latency and cost matter, and you need to see every token you send.
