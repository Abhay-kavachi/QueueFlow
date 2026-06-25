# QueueFlow - Multi-Tenant Universal Queue Platform

A complete scalable, multi-tenant hybrid queue management platform supporting both appointments and walk-ins for hospitals, universities, and government offices.

## 🚀 Key Platform Upgrades

- **Multi-Tenant Architecture**: Complete database isolation strictly keyed via `organization_id` ensuring a single hospital user cannot bleed into a university queue.
- **Service-Based Queues Structure**: The queue algorithm operates strictly via `(organization_id + service_id)` providing isolated, context-aware line progression.
- **Capacity-Aware Engine**: The global BullMQ engine dynamically limits how many users reach the `ACTIVE` boundary based on the specific service's real-time desk capacity (e.g. 3 active doctors = 3 active ticket holders).
- **Secure Real-Time Subscriptions (Socket.IO)**: Sockets automatically bind frontend clients to strictly verified `orgId_serviceId` isolated socket rooms ensuring true transport-layer data privacy.
- **Dynamic Identity Profiles**: Different organizations prompt dynamic login systems (Aadhaar, Student IDs, or standard Mobile) via the cleanly decoupled `AuthContext` strategy.
- **Aggressive Guardrails**: Features explicit DDoS mitigation with `express-rate-limit`, precise `Joi` API input verification, robust Worker authorization checks, and sensitive data masking pipelines.

## System Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   React     │    │   Node.js   │    │ PostgreSQL  │
│  Frontend   │◄──►│   Backend   │◄──►│     DB      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Socket    │    │    Redis    │    │   Python    │
│     IO      │    │   (BullMQ)  │    │   ML/Stats  │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Quick Start (Native Execution)

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL (Native Windows or WSL)
- Redis 5.0+ (Windows Port or WSL)

1. **Install and Start Databases**
   - Verify PostgreSQL configuration (`localhost:5432`)
   - Verify Redis service execution (`localhost:6379`)

2. **Boot Architecture**
```bash
# Terminal 1: Backend API Engine (Starts Nodemon & Express)
cd backend
npm install
npm run dev

# Terminal 2: Progressive Web App
cd frontend
npm install
npm start

# Terminal 3: Analytics (Wait-time Forecasting)
cd ml-service
pip install -r requirements.txt
python app.py
```

## API Access & Ports
- **Frontend App**: http://localhost:3001
- **Backend Hub**: http://localhost:3000
- **AI Forecasting Engine**: http://localhost:5000

## Architecture Security & Concurrency

**Concurrency & Resource Locking:**
To prevent race conditions during high-volume queue operations (e.g., two doctors clicking "Call Next Patient" at the exact same millisecond), the `QueueModel` employs strict row-level `SELECT ... FOR UPDATE` locks natively within PostgreSQL transactions.
1. **Queue Advancement (`callNextCurrent`)**: Explicitly locks the top `pending` row to guarantee only one worker claims the patient.
2. **Patient Activation (`moveQueueForward`)**: Locks the `next` user row to avoid state-transition races.
3. **Grace Expiration**: Locks the `grace` user to prevent a worker from reinstating a patient exactly as the automated job expires them.

**Minimum Viable Security (MVS) Checks Installed:**
1. **Rate Limiting**: Globally locked to 50 max hits to halt API floods, with a specialized sub-ceiling of 5 max hits for the `/api/auth` login endpoint preventing expensive SMS spam outcries.
2. **Schema Sanitization**: Joi data validators lock the API boundary defending against injection via corrupted `uuid` inputs or overloaded JSON strings.
3. **Database-Verified Routing**: Prevents backend session hijack by continuously mapping `req.user.session` exclusively back to exactly matched worker service clusters. Workers natively cannot jump outside their assigned boundaries.
4. **Data Redaction Pipelines**: Strips off raw phone and 12-digit Aadhaar returns before transit (`XXXX-XXXX-1234`).

## Background Processor (Queue Engine)

Instead of instantiating micro-caches sequentially on Node startup, the core queue processor leverages BullMQ in a massive master stream `queueflow-global-engine`. Wait operations map immediately via their database hash boundaries mitigating race conditions across thousands of parallel users. 

## Testing The Platform
1. **Navigate to the Client Application**.
2. **Select Context**: Click either "City General Hospital" or "Tech University".
3. **Identity Hook**: The application dynamically expects either an Aadhaar or a Student ID based on context. Enter mock data (validation is bypassed for speedy demos in `UserInterface.tsx`).
4. **Launch Room Connect**: When joining "Doctor A" or "Blood Lab", watch the Application actively sync socket hooks via isolated namespace.

## License

This project is tailored strictly for demonstrating enterprise multi-tenant software layout patterns. Modify and adapt licensing terms per execution.