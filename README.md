# Telegram Spam Cleaner — Concept Overview

A modular, privacy-first architecture for automatically detecting and deleting spam messages in **private Telegram chats** using **TDLib**, **local LLMs**, and **vector similarity learning**.

---

## 🎯 Goal

Provide an **autonomous client** that connects to Telegram through TDLib and automatically deletes or archives chats with unknown users that are likely spam — while continuously improving its detection accuracy via a local learning model and a shared, verified spam database.

---

## 🧩 High-Level Architecture

### Core Components

| Component | Role |
|------------|------|
| **Orchestrator / Controller** | Manages per-user containers, session lifecycles, and login flows (QR / phone / code). |
| **User Containers (Ephemeral TDLib Agents)** | Each container runs an isolated TDLib instance and a lightweight logic layer (Node.js / Rust). |
| **Local LLM / Classifier** | Performs semantic spam classification using embeddings and learned heuristics. |
| **Vector DB** | Stores message embeddings, metadata, and similarity clusters for ongoing learning. |
| **Public Spam DB** | Collects verified spam sender fingerprints (hashed, privacy-safe) after community verification. |
| **Bot / Frontend** | Provides a simple user interface to initialize, log in, and monitor cleanup actions. |
| **Audit / Management DB** | Stores non-sensitive metadata, user settings, and decision logs. |
| **Human-in-the-loop Dashboard** | Allows human review of borderline or newly detected spam clusters. |

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

## 🚧 MVP → Production Roadmap

1. **Prototype single TDLib agent** with heuristic deletion rules.  
2. Add **bot login interface** and container orchestration.  
3. Integrate **embedding + vector similarity** search.  
4. Train **simple classifier** with labeled data.  
5. Launch **dry-run mode** (log decisions only).  
6. Deploy **Vector DB + verification backend**.  
7. Add **human review dashboard** and **public DB** publishing.  
8. Harden security, apply rate limits, and perform **red-team tests**.  

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

## 🧪 Development Example (Node + TDLib)

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
