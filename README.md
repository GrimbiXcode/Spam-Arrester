# Spam Arrester

A modular, privacy-first system for automatically detecting and handling spam in **private Telegram chats** using **TDLib**, heuristic detection, and planned **ML integration**.

## 📌 Current Status

- **✅ Phase 1 Complete**: Standalone agent with heuristic spam detection
- **✅ Phase 2 Complete**: Multi-user bot orchestrator with containerized agents
- **🚧 Phase 3 Planned**: ML integration with embeddings and vector similarity

---

## 🎯 Goal

Provide an **autonomous system** that:
- Connects to Telegram via TDLib
- Automatically detects and handles spam in private chats
- Uses heuristic scoring and (planned) ML-based classification
- Supports multi-user deployment with isolated sessions
- Maintains privacy with minimal data retention
- Enables future collaborative spam learning

---

## 🚀 Quick Start

See **QUICKSTART.md** for 5-minute setup guide.

**Two deployment modes:**
1. **Bot Orchestrator** (Recommended) - Telegram bot managing per-user containers
2. **Standalone Agent** - Direct TDLib client for single user

---

## 🧩 Architecture Overview

### Implemented Components (✅ Phase 1 & 2)

| Component | Status | Description |
|-----------|--------|-------------|
| **Agent** | ✅ Complete | TDLib client with heuristic spam detection |
| **Bot Orchestrator** | ✅ Complete | Telegram bot managing per-user containers |
| **Container Manager** | ✅ Complete | Docker integration for isolated agent instances |
| **Management Database** | ✅ Complete | SQLite storing users, settings, metrics, audit logs |
| **Detection Pipeline** | ✅ Complete | Two-stage heuristic filtering with configurable thresholds |
| **Action Handler** | ✅ Complete | Archive/block/delete with rate limiting |

### Planned Components (🚧 Phase 3+)

| Component | Status | Description |
|-----------|--------|-------------|
| **Embedding Service** | 🚧 Planned | Python FastAPI for SBERT-like embeddings |
| **Vector Database** | 🚧 Planned | FAISS for similarity search |
| **ML Classifier** | 🚧 Planned | Semantic spam classification |
| **Public Spam DB** | 🚧 Planned | Collaborative verified spam fingerprints |

---

## ⚙️ Data Flow (Per Message)

1. TDLib client receives a new private message.  
2. **Quick heuristics** are applied (unknown sender, contains URL, phone, etc.).  
3. If suspicious, an **embedding** is computed and compared via **vector similarity** to known spam clusters.  
4. The **classifier** merges heuristic + similarity scores to generate a decision.  
5. If above the action threshold → block, delete, or archive the chat.  
6. The metadata (not content) is stored in the **vector DB** and optionally reported to the **shared spam DB**.  
7. Decisions and statistics are logged for transparency and review.

---

## 🧠 Detection Logic

The system uses a **two-stage pipeline**:

1. **Heuristic filter (fast path):**
   - Sender not in contacts.
   - No common groups.
   - Contains link, handle, or phone number.
   - No profile photo or description.

2. **LLM-based classifier (slow path):**
   - Generates embeddings (SBERT-like).
   - Performs similarity lookup in Vector DB.
   - Applies a binary spam/ham classifier using features like message age, sender profile, and similarity confidence.

The model can be retrained periodically from labeled data gathered by all containers.

---

## 🧱 Data Model

| Entity | Description |
|---------|-------------|
| **MessageFingerprint** | Normalized message text (URLs and numbers stripped) → hashed for deduplication. |
| **Embedding** | Vector representation of the message used for similarity search. |
| **UserReputation** | Aggregated detection statistics, number of independent reports, and verification status. |
| **VerificationEntry** | Candidate spam senders awaiting multi-user or human confirmation. |

All identifiers are hashed (salted per-deployment) to preserve privacy.

---

## 🗃️ Public DB Verification Workflow

1. **Automatic Proposal** — triggered when the same sender fingerprint appears in ≥N independent user reports.  
2. **Verification** — either human review or consensus threshold among verified participants.  
3. **Publication** — verified entries (only hashed metadata) are published to the public DB.  
4. **Revocation** — entries can be challenged and revoked, maintaining an audit trail.

---

## 🧰 Technology Stack (Open Source First)

- **Telegram Core**: [TDLib](https://core.telegram.org/tdlib)  
- **TDLib Bindings**: `tdl` (Node.js) or `tdlight` (Java / Rust)  
- **Embedding Models**: Small sentence-transformer (quantized)  
- **Vector DB**: FAISS (local) → Milvus / Weaviate for distributed setups  
- **Classifier Service**: Python FastAPI + scikit-learn / PyTorch  
- **Storage Encryption**: LUKS volumes or Vault-managed secrets  
- **Observability**: Prometheus + Grafana  
- **Orchestration**: Docker Compose (MVP) → Kubernetes (k3s / full cluster)  

---

## 🧩 Container Architecture

Each user runs inside an **isolated ephemeral container** that:

- Uses TDLib for all Telegram interactions.
- Holds only encrypted session data (no chat history).
- Communicates only with:
  - The **LLM inference service**
  - The **Vector DB**
  - The **Orchestrator**
- Can be destroyed safely without losing global learning.

Optional alternative: a **shared agent pool** (multi-session TDLib) for lower resource usage.

---

## 🔐 Security & Privacy Principles

- No cleartext sessions or message storage.  
- All user identifiers hashed with unique salts.  
- Minimal data retention; no content logs.  
- Rate-limited destructive actions (deletes, blocks).  
- Per-container network isolation; no public egress.  
- Public DB contains **only verified, hashed identifiers**.  
- Optional encryption at rest and signed updates for integrity.  

---

## ⚖️ Risk & Compliance Notes

- **Telegram Rate Limits** — excessive automated blocking may trigger temporary restrictions.  
- **GDPR** — any public data (user handles, phone numbers) must be anonymized and aggregated.  
- **Abuse Mitigation** — reputation scoring and verification workflows prevent poisoning of the shared DB.  
- **Model Drift** — retrain classifier periodically and maintain human verification for edge cases.

---

## 🔬 Operational Metrics

| Metric | Description |
|---------|-------------|
| `msg_processed_total` | Total messages analyzed |
| `spam_detected_total` | Messages classified as spam |
| `false_positive_rate` | From human review |
| `vector_similarity_mean` | Average similarity between detections |
| `container_active_count` | Running TDLib agents |
| `deletes_per_minute` | Rate-limiting guardrail |

---

## 🗃️ Implementation Roadmap

### ✅ Phase 1: MVP Agent (Complete)
1. ✅ Single TDLib agent with heuristic rules
2. ✅ Archive/block/delete actions with rate limiting
3. ✅ Metrics tracking and logging
4. ✅ Docker deployment support
5. ✅ Comprehensive test coverage (67 tests)

### ✅ Phase 2: Bot Orchestration (Complete)
1. ✅ Telegram bot interface
2. ✅ Per-user container isolation
3. ✅ SQLite database for management
4. ✅ Interactive settings and monitoring
5. ✅ Health checks and container lifecycle
6. ✅ 85 tests with full coverage

### 🚧 Phase 3: ML Integration (Planned)
1. 🚧 Embedding generation service (Python FastAPI)
2. 🚧 Vector similarity search (FAISS)
3. 🚧 Hybrid heuristic + ML classifier
4. 🚧 Multi-user learning feedback loop

### 🚧 Phase 4: Collaborative Learning (Future)
1. 🚧 Verification backend for spam fingerprints
2. 🚧 Public spam database with privacy-safe hashing
3. 🚧 Human review dashboard
4. 🚧 Community-driven spam detection

---

## ⚠️ Red Team Checklist

| Risk | Mitigation |
|------|-------------|
| False positives | Archive instead of delete by default |
| Legal exposure | Never store or share PII |
| Model poisoning | Multi-source verification before publishing |
| Resource explosion | Autoscale and idle-timeout inactive containers |
| Telegram bans | Conservative action rate limits |
| Privacy breaches | Encryption, hashing, audit-only mode |

---

## 📊 Recommended Config Parameters

| Key | Default | Purpose |
|-----|----------|----------|
| `LOW_THRESHOLD` | 0.3 | Candidate trigger score |
| `ACTION_THRESHOLD` | 0.85 | Auto-delete confidence threshold |
| `VECTOR_SIMILARITY_CUTOFF` | 0.9 | Cosine similarity for cluster matches |
| `MIN_REPORTS_FOR_VERIFICATION` | 3 | Independent confirmations needed |
| `MAX_DELETES_PER_MINUTE` | 5 | Telegram safety limit |
| `CONTAINER_IDLE_TIMEOUT` | 7d | Auto-shutdown inactive sessions |

---

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **QUICKSTART.md** | 5-minute setup guide for both modes |
| **SETUP.md** | Complete configuration and deployment guide |
| **AGENT_SUMMARY.md** | Agent component features and architecture |
| **BOT_IMPLEMENTATION_SUMMARY.md** | Complete bot command reference |
| **PHASE2_SUMMARY.md** | Phase 2 implementation details |
| **WARP.md** | Development guide (for AI assistants) |

---

## 🧪 Implementation Example (Node + TDLib)

```ts
import { Client } from 'tdl'
import { TDLib } from 'tdl-tdlib-addon'

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH!
const client = new Client(new TDLib('/usr/lib/libtdjson.so'), { apiId, apiHash })
await client.connect()

function looksSpam(text) {
  return /\bhttps?:\/\/|t\.me\/|@[a-z0-9_]{3,}/i.test(text) ||
         /\+?\d[\d\s().-]{7,}/.test(text)
}

client.on('update', async u => {
  if (u._ !== 'updateNewMessage') return
  const { message } = u
  if (message.is_outgoing) return

  const chat = await client.invoke({ _: 'getChat', chat_id: message.chat_id })
  if (chat.type._ !== 'chatTypePrivate') return
  const userId = chat.type.user_id

  const user = await client.invoke({ _: 'getUser', user_id: userId })
  if (user.is_contact || user.is_mutual_contact) return

  const text = message.content?.text?.text ?? ''
  if (looksSpam(text)) {
    await client.invoke({ _: 'blockUser', user_id: userId })
    await client.invoke({
      _: 'deleteChatHistory',
      chat_id: message.chat_id,
      remove_from_chat_list: true,
      revoke: true
    })
  }
})
