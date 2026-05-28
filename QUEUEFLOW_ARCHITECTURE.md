# QueueFlow Technical Architecture & Documentation

This document serves as a comprehensive guide to understanding the QueueFlow system. It breaks down the application into four distinct technical pillars: **Database (DB)**, **Backend**, **Frontend**, and **Machine Learning (ML) Services**. 

Each section explains the components using the requested framework: *What, Why, Where, How, When to use*, and highlights the **Important Functions** navigating those files.

---

## 1. Database Layer (PostgreSQL & Redis)

### What
The storage foundation of the application. It employs a dual-database strategy:
*   **PostgreSQL**: A relational database that stores permanent, structured data (Users, Clinics, Historical Queue Records).
*   **Redis**: An in-memory data structure store used exclusively for managing high-speed, temporary background tasks (BullMQ).

### Why
*   Queue systems have two opposing data needs: permanent auditing and hyper-fast temporary state changes. 
*   **Postgres** is chosen for its strict ACID compliance ensuring that no permanent medical or queue records are randomly lost or corrupted.
*   **Redis** is chosen because pushing queue positions synchronously using Postgres alone would freeze the server under heavy load.

### Where
*   **Postgres Schema Maps**: Located entirely in `backend/sql/schema.sql`. (Includes `CHECK` constraints for `skipped`, `expired`, and `pending` states).
*   **Database Queries/Models**: Located in `backend/src/models/Queue.model.js` and `Auth.model.js`.

### How
*   The Node.js backend connects to Postgres using the raw `pg` library, executing direct SQL statements.
*   Redis is not queried directly; instead, the `BullMQ` library acts as a wrapper, translating queue logic into Redis commands automatically.

### When to Use
*   **Postgres**: Use when you need to store data forever (e.g., adding a new field for a citizen's "Date of Birth").
*   **Redis**: Use when you need temporary data or rate-limiting.

### Important Functions & Paths
*   **`update_updated_at_column()`** *(Path: `backend/sql/schema.sql`)*: A crucial PostgreSQL trigger that automatically dates rows the second they are updated.
*   **`QueueModel.moveToNextState()`** *(Path: `backend/src/models/Queue.model.js`)*: Contains the complex SQL subquery wrapper `UPDATE live_queue SET state = 'next'...` that pulls the next person in line safely mitigating race conditions.

---

## 2. Backend Services (Node.js & Express)

### What
The "Central Nervous System". It is a RESTful API and WebSocket broadcaster built on Node.js and Express.js that acts as the referee between the Database, the Frontend, and the ML Service.

### Why
*   **Node.js** has a non-blocking asynchronous architecture. This makes it exceptionally good at handling thousands of simultaneous open connections (Socket.IO websockets) without crashing or requiring massive server RAM.

### Where
*   **Root Entry**: `backend/src/app.js`.
*   **Core Business Logic**: `backend/src/services/queue.engine.js` (The heartbeat that calculates turns).
*   **Staff/Auth Routes**: `backend/src/routes/staff.routes.js` and `auth.routes.js`.
*   **Real-time Comms**: `backend/src/sockets/socket.handler.js` (Uses `staff-*` room naming).

### How
*   **HTTP Layer**: Express.js listens for standard web requests over HTTP (like logging in or uploading a CSV).
*   **Socket Layer**: `Socket.IO` wraps alongside Express. When `queue.engine.js` observes that it is finally a user's turn to see the doctor, it fires an event to `Socket.IO`, which beams a message directly into the user's web browser.

### When to Use
*   Modify this when you need new business rules. For example: *If a Staff member wants to "Pause" the queue*, you build an Express Route here.

### Important Functions & Paths
*   **`processQueueJob(job, serviceId)`** *(Path: `backend/src/services/queue.engine.js`)*: The master switchboard. It interprets BullMQ queue jobs and routes them to sub-functions like `CHECK_NEXT`, `START_GRACE`, or `EXPIRE_GRACE`.
*   **`startServer()` & `setupSocketHandlers()`** *(Path: `backend/src/app.js` and `backend/src/sockets/socket.handler.js`)*: Binds the Express REST routes and the WebSocket logic into a single cohesive server on boot.

---

## 3. Frontend Tools (React.js & Tailwind CSS)

### What
The User Interface (UI). It is a Single Page Application (SPA) built using React.js and strictly typed with TypeScript. It provides dedicated dashboards for Citizens, Workers, and System Administrators.

### Why
*   **React** allows developers to build reusable UI components (like Buttons, Tables) that dynamically re-render the exact millisecond underlying data changes.
*   **Tailwind CSS** allows the creation of beautiful, modern interfaces quickly.
*   **TypeScript** prevents human errors by strictly defining what data looks like before the code even runs.

### Where
*   **Core UI Components**: `frontend/src/`
*   **Citizen View**: `frontend/src/UserInterface.tsx` and `ApplyForm.tsx`.
*   **Staff Dashboard**: `frontend/src/StaffDashboard.tsx` (Previously `AdminDashboard.tsx`).
*   **Portal Selection**: `frontend/src/PortalSelector.tsx` (Directs Staff vs. Workers).

### How
*   The UI initializes an `Axios` client to fetch static data.
*   It opens a `Socket.IO-client` connection. It listens passively for events (like `'position_notification'`). When a packet arrives, React updates its State.

### When to Use
*   Use this when you are changing what the user **sees, clicks, or types**. 

### Important Functions & Paths
*   **`socket.on('position_notification', ...)` listeners** *(Path: `frontend/src/UserInterface.tsx`)*: Effect hooks inside the component that listen to server push events. If you rename events in the backend, you must update these React hooks.
*   **`handleBulkUpload()` / `StaffDashboard`** *(Path: `frontend/src/StaffDashboard.tsx`)*: Responsible for reaching out to the Python ML microservice and processing CSV batch injections for the queue.
*   **`registrationKey` Logic** *(Path: `frontend/src/StaffRegistration.tsx`)*: Enforces a security gate where new workers must know the **Admin Key** (The primary admin's password) to authorize their account creation.

---

## 4. Machine Learning (ML) Services (Python & Flask)

### What
An isolated microservice dedicated to data analytics and predictive modeling. It uses historical queue behaviors to forecast future trends.

### Why
*   While Node.js is great for web traffic, it lacks mature libraries for heavy mathematics and data science. **Python** is the industry standard for ML. 
*   By isolating it into a Flask microservice, the heavy computations won't accidentally freeze the main Node.js live-queue server.

### Where
*   **Main Application**: `ml-service/app.py`.

### How
*   It runs a lightweight **Flask** web server.
*   When summoned, it connects directly to PostgreSQL using `psycopg2`, pulls from `queue_records` into a pandas DataFrame, and trains a **Linear Regression model** (via Scikit-learn).
*   It uses **Matplotlib** to draw a `.png` file sent via HTTP response.

### When to Use
*   Modify this when you are looking to generate insights, charts, or upgrade predictive algorithms.

### Important Functions & Paths
*   **`fetch_wait_time_data(service_id, days=30)`** *(Path: `ml-service/app.py`)*: Uses Pandas to execute an optimized SQL query against PostgreSQL `queue_records`. Includes `MOCK_MODE` fallback for development without historical data.
*   **`generate_wait_time_prediction_plot(service_id)`** *(Path: `ml-service/app.py`)*: Instantiates the `LinearRegression()` model, feeds it historic ordinals, and predicts future trends. Wrapped in robust error handling to prevent 500 crashes on empty datasets.
