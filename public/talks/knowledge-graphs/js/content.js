/* Every word and every data point in the journey lives here.
   Edit this file to change what the audience sees. Nothing in here is code logic. */

window.CONTENT = {

  /* ---------- Graphs used in Part 1 ----------
     Every graph has the same shape: 7 nodes, 7 edges.
     That is what lets the hospital / bank / IT operations switch relabel in place. */
  graphs: {
    hospital: {
      label: "Hospital",
      nodes: [
        { id: "n0", name: "Maria Lopez",      type: "Patient",    props: { age: "67", ward: "Cardiology B", status: "Admitted" } },
        { id: "n1", name: "Dr Chen",          type: "Doctor",     props: { speciality: "Cardiology", on_call: "Yes" } },
        { id: "n2", name: "Warfarin",         type: "Drug",       props: { dose: "5 mg daily", class: "Blood thinner" } },
        { id: "n3", name: "Amoxicillin",      type: "Drug",       props: { class: "Penicillin antibiotic", route: "Oral" } },
        { id: "n4", name: "Chest infection",  type: "Condition",  props: { severity: "Moderate", onset: "3 days ago" } },
        { id: "n5", name: "Cardiology",       type: "Department", props: { beds: "24", head: "Dr Chen" } },
        { id: "n6", name: "Penicillin allergy", type: "Allergy",  props: { reaction: "Anaphylaxis", recorded: "2019", verified: "Yes" } }
      ],
      edges: [
        { id: "e0", source: "n0", target: "n1", verb: "treated by" },
        { id: "e1", source: "n0", target: "n2", verb: "takes" },
        { id: "e2", source: "n2", target: "n3", verb: "interacts with", props: { effect: "Raises bleeding risk" } },
        { id: "e3", source: "n3", target: "n4", verb: "treats" },
        { id: "e4", source: "n1", target: "n5", verb: "works in" },
        { id: "e5", source: "n0", target: "n6", verb: "has" },
        { id: "e6", source: "n6", target: "n3", verb: "rules out", props: { since: "2019" } }
      ]
    },
    ops: {
      label: "IT operations",
      nodes: [
        { id: "n0", name: "Nordic Bank",   type: "Client",   props: { region: "Nordics", tier: "Strategic", contract: "Managed cloud" } },
        { id: "n1", name: "Cloud Ops",     type: "Team",     props: { size: "14", lead: "A. Dubois", on_call: "Yes" } },
        { id: "n2", name: "Payment API",   type: "Service",  props: { criticality: "P1", sla: "99.95%" } },
        { id: "n3", name: "app-node-12",   type: "Server",   props: { os: "RHEL 9", site: "Paris", state: "Degraded" } },
        { id: "n4", name: "CHG-2210",      type: "Change",   props: { what: "TLS library upgrade", when: "02:14 today", approved: "Yes" } },
        { id: "n5", name: "Paris DC",      type: "Site",     props: { country: "France", tier: "III" } },
        { id: "n6", name: "INC-4821",      type: "Incident", props: { priority: "P1", opened: "02:31 today", impact: "Payments failing" } }
      ],
      edges: [
        { id: "e0", source: "n0", target: "n1", verb: "supported by" },
        { id: "e1", source: "n0", target: "n2", verb: "uses" },
        { id: "e2", source: "n2", target: "n3", verb: "runs on", props: { since: "2024" } },
        { id: "e3", source: "n3", target: "n4", verb: "received", props: { at: "02:14" } },
        { id: "e4", source: "n1", target: "n5", verb: "based in" },
        { id: "e5", source: "n0", target: "n6", verb: "reported" },
        { id: "e6", source: "n6", target: "n3", verb: "traced to", props: { confidence: "High" } }
      ]
    },
    bank: {
      label: "Bank",
      nodes: [
        { id: "n0", name: "Account 4471",  type: "Account", props: { opened: "2021", balance: "Low", risk: "Medium" } },
        { id: "n1", name: "Ola Berg",      type: "Person",  props: { age: "44", customer_since: "2015" } },
        { id: "n2", name: "Transfer T-88", type: "Transfer", props: { amount: "€48,000", time: "23:58", flagged: "Yes" } },
        { id: "n3", name: "Account 9930",  type: "Account", props: { opened: "Last month", balance: "Empty", risk: "High" } },
        { id: "n4", name: "Rowan Ltd",     type: "Company", props: { registered: "Last month", directors: "1" } },
        { id: "n5", name: "Oslo",          type: "Address", props: { country: "Norway" } },
        { id: "n6", name: "Device D-7f2",  type: "Device",  props: { kind: "Android phone", first_seen: "Last week" } }
      ],
      edges: [
        { id: "e0", source: "n0", target: "n1", verb: "owned by" },
        { id: "e1", source: "n0", target: "n2", verb: "sent" },
        { id: "e2", source: "n2", target: "n3", verb: "received by" },
        { id: "e3", source: "n3", target: "n4", verb: "held by" },
        { id: "e4", source: "n1", target: "n5", verb: "lives at" },
        { id: "e5", source: "n0", target: "n6", verb: "used from" },
        { id: "e6", source: "n6", target: "n3", verb: "logged into", props: { times: "3" } }
      ]
    }
  },

  /* ---------- Graph RAG scene (scene 2) ---------- */
  rag: {
    hospital: {
      question: "Can Maria Lopez take amoxicillin for her chest infection?",
      path: ["e5", "e6", "e1", "e2"],
      contextLines: [
        "Maria Lopez has a penicillin allergy (anaphylaxis, verified 2019).",
        "Penicillin allergy rules out amoxicillin.",
        "Maria Lopez takes warfarin, 5 mg daily.",
        "Warfarin interacts with amoxicillin: raises bleeding risk."
      ],
            answerWith: "No. Maria has a verified penicillin allergy with a history of anaphylaxis, which rules out amoxicillin. She is also on warfarin, which amoxicillin would interact with. Ask Dr Chen for a non-penicillin antibiotic and plan an INR check.",
      exampleNode: "n6",
      exampleText: "When an allergy node is verified, it overrides any drug it rules out. Answer with a clear no and name the alternative path."
    },
    ops: {
      question: "Why is the Payment API failing for Nordic Bank?",
      path: ["e1", "e2", "e3", "e6"],
      contextLines: [
        "Nordic Bank uses the Payment API (P1, SLA 99.95%).",
        "Payment API runs on app-node-12 (state: degraded).",
        "app-node-12 received change CHG-2210 at 02:14: TLS library upgrade.",
        "INC-4821 opened 02:31, traced to app-node-12 with high confidence."
      ],
            answerWith: "The Payment API runs on app-node-12, which received a TLS library upgrade (CHG-2210) at 02:14. Seventeen minutes later INC-4821 opened and was traced to that node. Roll back CHG-2210 on app-node-12 and notify Cloud Ops, who support Nordic Bank.",
      exampleNode: "n4",
      exampleText: "When an incident opens within an hour of a change on the same node, name the change first and propose the rollback."
    }
  },

  /* ---------- Checking scene (scene 3) ---------- */
  check: {
    bank: {
      task: "Agent task: is Transfer T-88 suspicious, and why?",
      rounds: [
        {
          claim: "T-88 looks like money moving between accounts of the same person.",
          links: [
            { source: "n0", target: "n2", verb: "sent" },
            { source: "n2", target: "n3", verb: "received by" },
            { source: "n1", target: "n3", verb: "owns" }
          ],
          feedback: "No edge: Ola Berg does not own Account 9930. The graph shows a different link into that account."
        },
        {
          claim: "T-88 moved €48,000 to a new account at a new company, reached from the same phone that used the sender's account.",
          links: [
            { source: "n0", target: "n2", verb: "sent" },
            { source: "n2", target: "n3", verb: "received by" },
            { source: "n3", target: "n4", verb: "held by" },
            { source: "n6", target: "n3", verb: "logged into" }
          ],
          feedback: "Every link exists. The claim matches the graph."
        }
      ]
    },
    ops: {
      task: "Agent task: what caused INC-4821?",
      rounds: [
        {
          claim: "INC-4821 was caused by a fault at the Paris data centre where the Payment API runs.",
          links: [
            { source: "n0", target: "n6", verb: "reported" },
            { source: "n6", target: "n3", verb: "traced to" },
            { source: "n2", target: "n5", verb: "runs on" }
          ],
          feedback: "No edge: the Payment API does not run on Paris DC. It runs on a server. Look at what happened to that server."
        },
        {
          claim: "INC-4821 was caused by change CHG-2210, a TLS upgrade applied to app-node-12, the server the Payment API runs on.",
          links: [
            { source: "n6", target: "n3", verb: "traced to" },
            { source: "n2", target: "n3", verb: "runs on" },
            { source: "n3", target: "n4", verb: "received" }
          ],
          feedback: "Every link exists. The claim matches the graph."
        }
      ]
    }
  },

  /* ---------- Where next (scene 4) ---------- */
  next: [
    {
      key: "subgraphs",
      title: "Sub-graphs by topic",
      generic: "A hospital does not keep one graph. Oncology, pharmacy and billing each get their own, deep and narrow. A question about a drug goes to pharmacy.",
      ops: "An IT estate keeps one graph per client platform, one per data centre, one per security domain. An outage question routes to that client's graph, and the answer arrives with the whole dependency chain attached."
    },
    {
      key: "failure",
      title: "Failure graphs",
      generic: "Every fault a bank has seen: what triggered it, what it broke, what fixed it. New incidents are matched against the chain before anyone starts guessing.",
      ops: "In IT operations the chain is trigger, fault, symptom, fix. When a new P1 opens, its symptoms are matched against every chain on record before anyone opens a terminal."
    },
    {
      key: "tacit",
      title: "Codifying what people know",
      generic: "The senior nurse knows which consultant will not prescribe on a Friday. That knowledge lives in her head until it is written as an edge.",
      ops: "The engineer who knows that a client's firewall rejects a certain header leaves. If that fact is an edge, the next engineer inherits it on day one."
    },
    {
      key: "api",
      title: "The graph behind an API",
      generic: "A bank exposes its customer graph to its own agents through one interface. The agents get relationships, not rows.",
      ops: "A service graph behind one interface that the operator's agents and the client's agents both query. They receive the relationships, and the meaning behind them."
    }
  ],

  /* ---------- SLM scene (scene 5) ---------- */
  models: {
    frontier: [
      { name: "Frontier model", size: "Hundreds of billions to trillions of parameters", runs: "A data centre you rent by the token", good: "Open-ended reasoning, long conversations, planning" }
    ],
    small: [
      { name: "Gemma 4 12B", params: 12, runs: "A laptop with 16 GB of memory", good: "General writing and summarising" },
      { name: "Qwen 3 8B",   params: 8,  runs: "A laptop with 8 GB of memory", good: "Coding and structured extraction" },
      { name: "Phi-4 14B",   params: 14, runs: "One consumer GPU", good: "Reasoning on narrow tasks" },
      { name: "gpt-oss 20B", params: 20, runs: "One 16 GB GPU", good: "Tool use and agent steps" },
      { name: "Llama 3.2 3B", params: 3, runs: "A phone or thin laptop", good: "Classification and short answers" },
      { name: "SmolLM3 3B",  params: 3,  runs: "A phone or thin laptop", good: "On-device assistants" }
    ]
  },

  /* ---------- Frontier vs small (scene 6) ---------- */
  decide: {
    sliders: [
      { key: "sensitivity", label: "How sensitive is the data?", low: "Public", high: "Client secrets" },
      { key: "volume",      label: "How many requests?", low: "A few a day", high: "Millions a day" },
      { key: "reasoning",   label: "How hard is the thinking?", low: "Sort and label", high: "Open-ended problem" },
      { key: "speed",       label: "How fast must it answer?", low: "Minutes are fine", high: "Under a second" }
    ],
    tradeoff: "Small models reason less well and need more engineering: sharper prompts, evaluation, and often fine-tuning."
  },

  /* ---------- Demo (scene 7) ---------- */
  demo: {
    videoSrc: "/talks/knowledge-graphs/assets/demo.mp4",
    commands: [
      { cmd: "curl -fsSL https://ollama.com/install.sh | sh", why: "Installs Ollama. On Mac and Windows it is a normal installer." },
      { cmd: "ollama run gemma4:12b", why: "Downloads the model once, then opens a chat. Nothing leaves the machine." },
      { cmd: "curl localhost:11434/api/generate -d '{\"model\":\"gemma4:12b\",\"prompt\":\"...\"}'", why: "The same model is now an API on your laptop. Any app can call it." }
    ]
  },

  /* ---------- How work changes (scene 8) ---------- */
  work: {
    vaguePrompt: "Tell me about the payment problem.",
    vagueAnswer: "Payment problems can have many causes. It would help to know which system, when it started, and who is affected. Common causes include network faults, expired certificates and failed deployments.",
    narrowPrompt: "You are an incident analyst. Using only the facts below, name the most likely cause of INC-4821 in one sentence, then one action.\n\nFacts:\n- Payment API runs on app-node-12\n- app-node-12 received CHG-2210 (TLS library upgrade) at 02:14\n- INC-4821 opened at 02:31, traced to app-node-12",
    narrowAnswer: "Most likely cause: CHG-2210, the TLS library upgrade applied to app-node-12 seventeen minutes before INC-4821 opened. Action: roll back CHG-2210 on app-node-12 and re-test the Payment API.",
    ollamaModel: "gemma4:12b",
    pipeline: [
      { role: "Frontier model", does: "Reads the vague request. Breaks it into narrow tasks. Writes the sharp prompts." },
      { role: "Small models", does: "Each runs one narrow task, on your hardware, fast and cheap." },
      { role: "Knowledge graph", does: "Checks every claim. Sends back what does not match." }
    ]
  },

  /* ---------- Scenes: titles, lines, speaker notes ---------- */
  scenes: [
    {
      key: "open",
      title: "Knowledge graphs",
      sub: "",
      notes: "Do not explain anything yet. Press → four times. Each press adds a node. Let the picture build before you name it."
    },
    {
      key: "what",
      title: "What a knowledge graph is",
      lines: [
        "A node is a noun. An edge is a verb. A property is an adjective.",
        "Models draft it. People verify it. Only verified edges count."
      ],
      notes: "Hover a node to show properties. Hover an edge to show the verb. → once: drafted becomes verified. → again: the hospital becomes IT operations with the same shape. That flip is the point."
    },
    {
      key: "rag",
      title: "Before the model: richer questions",
      lines: [
        "The graph finds the facts that matter and puts them in front of the model.",
        "A verified example shows the model what a good answer looks like."
      ],
      notes: "→ Ask. The path lights up, the facts fly in, then the verified example arrives. → again: the answer types out. The hospital example gives a safe no. Switch to IT operations for a root cause: the same mechanism, a different kind of answer."
    },
    {
      key: "check",
      title: "After the model: the graph checks the answer",
      lines: [
        "An agent proposes an answer as a chain of claims.",
        "Every claim is tested against the graph. What fails goes back as feedback."
      ],
      notes: "Bank: the agent assumes one owner; the graph shows a shared phone instead. → Check, → give feedback, → check again. IT operations: the agent blames the site; the graph points to the server. Say once: the graph is only an authority while someone keeps it current."
    },
    {
      key: "next",
      title: "Where this goes next",
      lines: [],
      notes: "Four tiles. Open each, flip between the two examples. Five minutes for all four. On the API tile: the graph is exposed to your own agents and your clients' agents."
    },
    {
      key: "slm-title",
      title: "Small language models",
      sub: "Part two",
      notes: "Pause here. New colours, new subject. Take a breath before starting."
    },
    {
      key: "slm",
      title: "What a small language model is",
      lines: [
        "A model that runs on one laptop or one GPU.",
        "Usually under fifteen billion parameters. It fits in the room."
      ],
      notes: "Tap the marbles. Each rolls into the laptop and shows what runs it. Tap the frontier sphere: it does not fit on screen, and a data centre grows around it."
    },
    {
      key: "decide",
      title: "When to go small, when to go big",
      lines: [
        "Move the sliders. Watch where the data goes."
      ],
      notes: "Start with everything low: data stays in the building. Push sensitivity up: still inside. Push reasoning up: dots stream out to the cloud. Read the trade-off card aloud once."
    },
    {
      key: "demo",
      title: "Running one in five minutes",
      lines: [],
      notes: "Play the recording. Three commands. Point out the third: it is now an API on the laptop."
    },
    {
      key: "work",
      title: "How it changes the way you work",
      lines: [
        "A small model does not want a conversation. It wants a task.",
        "Plan with a big model. Execute with small ones. Check with the graph."
      ],
      notes: "Send the vague prompt first. Weak answer. Send the narrow prompt with the graph facts. Sharp answer. Then reveal the pipeline: both halves in one picture."
    },
    {
      key: "close",
      title: "Questions",
      lines: [
        "Nouns, verbs, adjectives. Verified edges are the authority.",
        "Before the model, the graph feeds it. After the model, the graph checks it.",
        "Small models fit in the room. They want narrow tasks.",
        "Big model plans, small models execute, graph checks."
      ],
      notes: "Five minutes."
    }
  ]
};
