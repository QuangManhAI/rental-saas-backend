# 🏗️ Rental SaaS – Next.js Frontend Architecture & Gemini Prompt

> **Purpose**: This document is a self-contained specification you can hand directly to
> Google Gemini (or any LLM) to generate a production-ready Next.js frontend for the
> Rental Management SaaS backend that is already running.

---

## Table of Contents

1. [System Prompt for Gemini](#1-system-prompt-for-gemini)
2. [Project Overview](#2-project-overview)
3. [Tech Stack](#3-tech-stack)
4. [Folder Structure](#4-folder-structure)
5. [Backend API Contract](#5-backend-api-contract)
6. [Data Models / TypeScript Types](#6-data-models--typescript-types)
7. [Authentication Flow](#7-authentication-flow)
8. [Feature Specifications](#8-feature-specifications)
9. [UI/UX Guidelines](#9-uiux-guidelines)
10. [Non-Functional Requirements](#10-non-functional-requirements)

---

## 1. System Prompt for Gemini

> **Copy everything below this line and paste it as the prompt to Gemini.**

```
You are a Principal Frontend Architect. Your job is to generate the COMPLETE source
code for a Next.js 15 (App Router) frontend for a Rental Management SaaS platform.

RULES:
1. Generate EVERY file listed in the folder structure — no placeholders, no "TODO".
2. TypeScript STRICT mode. No `any`. No `@ts-ignore`.
3. Use the EXACT API contract specified (base URL, routes, DTOs, enums).
4. Feature-based modular architecture — each domain has its own folder.
5. Use Zustand for client state, React Query (TanStack Query v5) for server state.
6. Tailwind CSS 4 + shadcn/ui components only — no custom CSS.
7. All API calls go through a single Axios instance with interceptors for JWT refresh.
8. Wrap every authenticated page with the AuthGuard component.
9. Vietnamese locale for dates (dd/MM/yyyy) and currency (VND, ₫).
10. Generate responsive layouts — mobile-first, sidebar collapses on small screens.
11. Every form must show server-side validation errors next to the relevant field.
12. Support both OWNER and STAFF roles — hide "Staff Management" from STAFF users.

Below is the FULL specification.
```

---

## 2. Project Overview

| Item | Value |
|---|---|
| Product | Multi-tenant Rental Management SaaS |
| Backend | NestJS v11, MongoDB Atlas, JWT auth |
| Backend Base URL | `http://localhost:3000/api` |
| API Prefix | All routes start with `/api/` |
| Multi-tenancy | `ownerId`-scoped — backend enforces it; frontend never sends `ownerId` |
| Roles | `owner` (full access), `staff` (restricted — no staff CRUD, no delete) |
| Response Wrapper | `{ statusCode: number, message: string, data: T }` |
| Auth | Access token (JWT, 1d) + Refresh token (opaque, 7d, rotation) |

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.x |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS | 4.x |
| Component Library | shadcn/ui | latest |
| Server State | TanStack React Query | v5 |
| Client State | Zustand | v5 |
| HTTP Client | Axios | 1.x |
| Forms | React Hook Form + Zod | latest |
| Icons | Lucide React | latest |
| Date Formatting | date-fns | latest |
| Charts (optional) | Recharts | latest |
| Package Manager | pnpm | latest |

---

## 4. Folder Structure

```
rental-saas-frontend/
├── .env.local                          # NEXT_PUBLIC_API_URL=http://localhost:3000/api
├── .eslintrc.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── postcss.config.mjs
│
├── public/
│   ├── favicon.ico
│   └── logo.svg
│
├── src/
│   ├── app/                            # -------- Next.js App Router --------
│   │   ├── layout.tsx                  # RootLayout: Providers, fonts, metadata
│   │   ├── loading.tsx                 # Global loading spinner
│   │   ├── not-found.tsx               # 404 page
│   │   ├── error.tsx                   # Global error boundary
│   │   │
│   │   ├── (auth)/                     # Group: public auth pages
│   │   │   ├── layout.tsx              # Centered card layout, no sidebar
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   │
│   │   └── (dashboard)/                # Group: authenticated pages
│   │       ├── layout.tsx              # Sidebar + Topbar layout with AuthGuard
│   │       ├── page.tsx                # Dashboard overview (redirect or stats)
│   │       ├── properties/
│   │       │   ├── page.tsx            # Property list
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create property
│   │       │   └── [id]/
│   │       │       ├── page.tsx        # Property detail + rooms list
│   │       │       └── edit/
│   │       │           └── page.tsx    # Edit property
│   │       ├── rooms/
│   │       │   ├── page.tsx            # All rooms list (filterable)
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create room (select property)
│   │       │   └── [id]/
│   │       │       ├── page.tsx        # Room detail
│   │       │       └── edit/
│   │       │           └── page.tsx    # Edit room
│   │       ├── tenants/
│   │       │   ├── page.tsx            # Tenant list
│   │       │   ├── new/
│   │       │   │   └── page.tsx
│   │       │   └── [id]/
│   │       │       ├── page.tsx
│   │       │       └── edit/
│   │       │           └── page.tsx
│   │       ├── contracts/
│   │       │   ├── page.tsx            # Contract list with status badges
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create contract (select room, tenant)
│   │       │   └── [id]/
│   │       │       └── page.tsx        # Contract detail + terminate button
│   │       ├── bills/
│   │       │   ├── page.tsx            # Bill list with status filter
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create bill (select contract)
│   │       │   └── [id]/
│   │       │       └── page.tsx        # Bill detail + payment history
│   │       ├── payments/
│   │       │   └── new/
│   │       │       └── page.tsx        # Create payment (select bill)
│   │       ├── users/                  # OWNER-only
│   │       │   ├── page.tsx            # Staff list
│   │       │   ├── new/
│   │       │   │   └── page.tsx        # Create staff
│   │       │   └── [id]/
│   │       │       └── edit/
│   │       │           └── page.tsx    # Edit staff
│   │       └── profile/
│   │           └── page.tsx            # Current user profile
│   │
│   ├── components/                     # -------- Shared UI Components --------
│   │   ├── ui/                         # shadcn/ui primitives (auto-generated)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   └── pagination.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx             # Collapsible sidebar with nav links
│   │   │   ├── topbar.tsx              # User avatar, logout, breadcrumbs
│   │   │   └── mobile-nav.tsx          # Sheet-based mobile navigation
│   │   ├── shared/
│   │   │   ├── auth-guard.tsx          # Redirect to /login if no token
│   │   │   ├── role-guard.tsx          # Hide children if role mismatch
│   │   │   ├── page-header.tsx         # Title + action button slot
│   │   │   ├── data-table.tsx          # Generic table with sort/filter
│   │   │   ├── confirm-dialog.tsx      # "Are you sure?" dialog
│   │   │   ├── status-badge.tsx        # Colored badge for statuses
│   │   │   ├── empty-state.tsx         # "No data" placeholder
│   │   │   ├── loading-skeleton.tsx    # Skeleton rows for tables
│   │   │   └── error-message.tsx       # Inline field error display
│   │   └── forms/
│   │       ├── property-form.tsx       # Reused by create + edit
│   │       ├── room-form.tsx
│   │       ├── tenant-form.tsx
│   │       ├── contract-form.tsx
│   │       ├── bill-form.tsx
│   │       ├── payment-form.tsx
│   │       └── user-form.tsx
│   │
│   ├── lib/                            # -------- Core Libraries --------
│   │   ├── axios.ts                    # Axios instance + interceptors
│   │   ├── query-client.ts             # TanStack Query client config
│   │   ├── utils.ts                    # cn(), formatCurrency(), formatDate()
│   │   └── validators.ts              # Zod schemas for every form
│   │
│   ├── hooks/                          # -------- Custom React Hooks --------
│   │   ├── use-auth.ts                 # Login, register, logout, refresh
│   │   ├── use-properties.ts           # CRUD queries + mutations
│   │   ├── use-rooms.ts
│   │   ├── use-tenants.ts
│   │   ├── use-contracts.ts
│   │   ├── use-bills.ts
│   │   ├── use-payments.ts
│   │   └── use-users.ts
│   │
│   ├── services/                       # -------- API Service Layer --------
│   │   ├── auth.service.ts
│   │   ├── properties.service.ts
│   │   ├── rooms.service.ts
│   │   ├── tenants.service.ts
│   │   ├── contracts.service.ts
│   │   ├── bills.service.ts
│   │   ├── payments.service.ts
│   │   └── users.service.ts
│   │
│   ├── stores/                         # -------- Zustand Stores --------
│   │   └── auth.store.ts              # tokens, user profile, isAuthenticated
│   │
│   ├── types/                          # -------- TypeScript Types --------
│   │   ├── auth.types.ts
│   │   ├── user.types.ts
│   │   ├── property.types.ts
│   │   ├── room.types.ts
│   │   ├── tenant.types.ts
│   │   ├── contract.types.ts
│   │   ├── bill.types.ts
│   │   ├── payment.types.ts
│   │   ├── api.types.ts               # ApiResponse<T>, PaginatedResult<T>
│   │   └── enums.ts                   # All enums in one file
│   │
│   ├── constants/                      # -------- App Constants --------
│   │   ├── routes.ts                  # Route path constants
│   │   ├── query-keys.ts             # React Query key factory
│   │   └── nav-items.ts              # Sidebar navigation config
│   │
│   └── providers/
│       └── app-providers.tsx           # QueryClientProvider + Toaster
```

---

## 5. Backend API Contract

### 5.1 Authentication — `/api/auth`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/auth/register` | ❌ | `{ email, password, fullName, phone? }` | `{ data: { accessToken, refreshToken, user } }` |
| `POST` | `/auth/login` | ❌ | `{ email, password }` | `{ data: { accessToken, refreshToken, user } }` |
| `POST` | `/auth/refresh` | ❌ | `{ refreshToken }` | `{ data: { accessToken, refreshToken } }` |
| `POST` | `/auth/logout` | ✅ JWT | `{ refreshToken }` | `{ message: 'Logged out' }` |
| `GET`  | `/auth/profile` | ✅ JWT | — | `{ data: User }` |

### 5.2 Users (Staff Management) — `/api/users` — **OWNER only**

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/users` | ✅ OWNER | `{ email, password, fullName, phone? }` | `{ data: User }` |
| `GET` | `/users` | ✅ OWNER | — | `{ data: User[] }` |
| `GET` | `/users/profile` | ✅ JWT | — | `{ data: User }` |
| `GET` | `/users/:id` | ✅ JWT | — | `{ data: User }` |
| `PATCH` | `/users/:id` | ✅ OWNER | `Partial<User>` | `{ data: User }` |
| `DELETE` | `/users/:id` | ✅ OWNER | — | `{ data: User }` |

### 5.3 Properties — `/api/properties`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/properties` | ✅ JWT | `{ name, address, description? }` | `{ data: Property }` |
| `GET` | `/properties` | ✅ JWT | — | `{ data: Property[] }` |
| `GET` | `/properties/:id` | ✅ JWT | — | `{ data: Property }` |
| `PATCH` | `/properties/:id` | ✅ JWT | `Partial<Property>` | `{ data: Property }` |
| `DELETE` | `/properties/:id` | ✅ JWT | — | `{ data: Property }` |

### 5.4 Rooms — `/api/rooms`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/rooms` | ✅ JWT | `{ name, price, area?, propertyId, description?, status? }` | `{ data: Room }` |
| `GET` | `/rooms?propertyId=xxx` | ✅ JWT | — | `{ data: Room[] }` |
| `GET` | `/rooms/:id` | ✅ JWT | — | `{ data: Room }` |
| `PATCH` | `/rooms/:id` | ✅ JWT | `Partial<Room>` | `{ data: Room }` |
| `DELETE` | `/rooms/:id` | ✅ JWT | — | `{ data: Room }` |

### 5.5 Tenants — `/api/tenants`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/tenants` | ✅ JWT | `{ fullName, email?, phone, identityCard, address?, dob? }` | `{ data: Tenant }` |
| `GET` | `/tenants` | ✅ JWT | — | `{ data: Tenant[] }` |
| `GET` | `/tenants/:id` | ✅ JWT | — | `{ data: Tenant }` |
| `PATCH` | `/tenants/:id` | ✅ JWT | `Partial<Tenant>` | `{ data: Tenant }` |
| `DELETE` | `/tenants/:id` | ✅ JWT | — | `{ data: Tenant }` |

### 5.6 Contracts — `/api/contracts`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/contracts` | ✅ JWT | `{ roomId, tenantId, startDate, endDate, deposit?, rentPrice }` | `{ data: Contract }` |
| `GET` | `/contracts` | ✅ JWT | — | `{ data: Contract[] }` |
| `GET` | `/contracts/:id` | ✅ JWT | — | `{ data: Contract }` |
| `PATCH` | `/contracts/:id/terminate` | ✅ JWT | — | `{ data: Contract }` |

> **Note**: Contracts cannot be freely updated. Only termination is allowed (sets status to TERMINATED and releases the room).

### 5.7 Bills — `/api/bills`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/bills` | ✅ JWT | `{ contractId, month, year, electricOldIndex, electricNewIndex, electricRate, waterOldIndex, waterNewIndex, waterRate, otherFee? }` | `{ data: Bill }` |
| `GET` | `/bills` | ✅ JWT | — | `{ data: Bill[] }` |
| `GET` | `/bills/:id` | ✅ JWT | — | `{ data: Bill }` |
| `DELETE` | `/bills/:id` | ✅ JWT | — | `{ data: Bill }` |

> **Backend auto-calculates**: `electricCost = (newIndex - oldIndex) * rate`, `waterCost = (newIndex - oldIndex) * rate`, `totalAmount = roomPrice + electricCost + waterCost + otherFee`. `roomPrice` is fetched from the active contract's `rentPrice`.

### 5.8 Payments — `/api/payments`

| Method | Route | Auth | Body | Response |
|--------|-------|------|------|----------|
| `POST` | `/payments` | ✅ JWT | `{ billId, amount, method?, note? }` | `{ data: Payment }` |
| `GET` | `/payments/bill/:billId` | ✅ JWT | — | `{ data: Payment[] }` |
| `DELETE` | `/payments/:id` | ✅ JWT | — | `{ data: Payment }` |

> **Backend auto-updates bill**: When payment is created/deleted, backend recalculates `paidAmount` and updates bill status (UNPAID → PARTIAL → PAID).

---

## 6. Data Models / TypeScript Types

### 6.1 Enums

```typescript
// src/types/enums.ts

export enum Role {
  OWNER = 'owner',
  STAFF = 'staff',
}

export enum RoomStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
}

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
}

export enum BillStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}
```

### 6.2 Entity Interfaces

```typescript
// src/types/api.types.ts
export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

// src/types/auth.types.ts
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokenPair {
  user: User;
}

// src/types/user.types.ts
export interface User {
  _id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: Role;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// src/types/property.types.ts
export interface Property {
  _id: string;
  name: string;
  address: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePropertyRequest {
  name: string;
  address: string;
  description?: string;
}

// src/types/room.types.ts
export interface Room {
  _id: string;
  name: string;
  price: number;
  area?: number;
  status: RoomStatus;
  description?: string;
  propertyId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomRequest {
  name: string;
  price: number;
  area?: number;
  propertyId: string;
  description?: string;
  status?: RoomStatus;
}

// src/types/tenant.types.ts
export interface Tenant {
  _id: string;
  fullName: string;
  email?: string;
  phone: string;
  identityCard: string;
  address?: string;
  dob?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantRequest {
  fullName: string;
  email?: string;
  phone: string;       // 9-15 digits
  identityCard: string; // min 9 chars
  address?: string;
  dob?: string;         // ISO date string
}

// src/types/contract.types.ts
export interface Contract {
  _id: string;
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  deposit: number;
  rentPrice: number;
  status: ContractStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractRequest {
  roomId: string;
  tenantId: string;
  startDate: string;   // ISO date string
  endDate: string;      // ISO date string
  deposit?: number;
  rentPrice: number;
}

// src/types/bill.types.ts
export interface Bill {
  _id: string;
  contractId: string;
  roomId: string;
  month: number;        // 1-12
  year: number;
  electricOldIndex: number;
  electricNewIndex: number;
  electricRate: number;
  electricCost: number;  // auto-calculated
  waterOldIndex: number;
  waterNewIndex: number;
  waterRate: number;
  waterCost: number;     // auto-calculated
  roomPrice: number;     // from contract.rentPrice
  otherFee: number;
  totalAmount: number;   // auto-calculated
  paidAmount: number;    // auto-updated by payments
  status: BillStatus;    // auto-updated by payments
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillRequest {
  contractId: string;
  month: number;
  year: number;
  electricOldIndex: number;
  electricNewIndex: number;
  electricRate: number;
  waterOldIndex: number;
  waterNewIndex: number;
  waterRate: number;
  otherFee?: number;
}

// src/types/payment.types.ts
export interface Payment {
  _id: string;
  billId: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequest {
  billId: string;
  amount: number;       // min 1
  method?: PaymentMethod;
  note?: string;
}
```

---

## 7. Authentication Flow

### 7.1 Token Storage

```
accessToken  → Zustand store (memory only, NEVER localStorage)
refreshToken → localStorage (persisted across page reloads)
```

### 7.2 Axios Interceptor Logic

```
REQUEST interceptor:
  → Attach `Authorization: Bearer <accessToken>` to every request

RESPONSE interceptor (on 401):
  1. Read refreshToken from localStorage
  2. POST /api/auth/refresh { refreshToken }
  3. If success → store NEW accessToken + NEW refreshToken (rotation!)
  4. Retry the original failed request with new accessToken
  5. If refresh fails → clear tokens, redirect to /login
```

### 7.3 Auth Store (Zustand)

```typescript
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  hydrate: () => void; // Load refreshToken from localStorage on mount
}
```

### 7.4 Auth Guard Component

```
- Wraps every (dashboard) layout
- On mount: check if accessToken exists
  - If NO accessToken but refreshToken exists → try silent refresh
  - If neither → redirect to /login
- Show loading skeleton while checking
```

---

## 8. Feature Specifications

### 8.1 Login Page (`/login`)

- Fields: email, password
- "Remember me" checkbox (optional)
- Link to `/register`
- On submit → `POST /auth/login` → store tokens → redirect to `/`
- Show validation errors inline

### 8.2 Register Page (`/register`)

- Fields: email, password, fullName, phone (optional)
- Link to `/login`
- On submit → `POST /auth/register` → store tokens → redirect to `/`
- **Only OWNER registration** (backend handles role assignment)

### 8.3 Dashboard (`/`)

- Summary cards:
  - Total Properties
  - Total Rooms (available / occupied / maintenance)
  - Active Contracts
  - Unpaid Bills count + total amount
- Recent bills table (last 5)
- Quick actions: "New Property", "New Contract", "New Bill"

### 8.4 Properties (`/properties`)

- **List**: Table with columns: Name, Address, Description, Rooms Count, Actions
- **Create** (`/properties/new`): Form → `POST /properties`
- **Detail** (`/properties/:id`): Property info + filtered rooms list for this property
- **Edit** (`/properties/:id/edit`): Pre-filled form → `PATCH /properties/:id`
- **Delete**: Confirm dialog → `DELETE /properties/:id`

### 8.5 Rooms (`/rooms`)

- **List**: Table with columns: Name, Property (name), Price, Area, Status (badge), Actions
  - Filter by property (dropdown), filter by status (dropdown)
- **Create** (`/rooms/new`): Form with property selector → `POST /rooms`
- **Detail** (`/rooms/:id`): Room info + current contract (if OCCUPIED)
- **Edit** (`/rooms/:id/edit`): Pre-filled form → `PATCH /rooms/:id`
- **Delete**: Confirm dialog

### 8.6 Tenants (`/tenants`)

- **List**: Table: Full Name, Phone, Identity Card (CCCD), Email, Actions
  - Search by name or identity card
- **Create** (`/tenants/new`): Form → `POST /tenants`
- **Detail** (`/tenants/:id`): Tenant info + contracts list for this tenant
- **Edit** (`/tenants/:id/edit`): Pre-filled form → `PATCH /tenants/:id`
- **Delete**: Confirm dialog

### 8.7 Contracts (`/contracts`)

- **List**: Table: Room Name, Tenant Name, Start Date, End Date, Rent Price, Status (badge), Actions
  - Filter by status (ACTIVE, EXPIRED, TERMINATED)
- **Create** (`/contracts/new`):
  - Select Room (only AVAILABLE rooms shown)
  - Select Tenant (dropdown with search)
  - Date range picker for start/end
  - Rent price, deposit
  - → `POST /contracts` (backend: sets room to OCCUPIED atomically)
- **Detail** (`/contracts/:id`):
  - Contract info
  - "Terminate Contract" button (only for ACTIVE contracts)
  - → `PATCH /contracts/:id/terminate` (backend: sets room back to AVAILABLE)
  - Associated bills list

### 8.8 Bills (`/bills`)

- **List**: Table: Room, Month/Year, Total Amount, Paid Amount, Status (badge), Actions
  - Filter by status (UNPAID, PARTIAL, PAID, OVERDUE)
- **Create** (`/bills/new`):
  - Select Contract (only ACTIVE contracts)
  - Month/Year selectors
  - Electric: old index, new index, rate → show calculated cost live
  - Water: old index, new index, rate → show calculated cost live
  - Other fee (optional)
  - Show total preview: `roomPrice + electricCost + waterCost + otherFee`
  - → `POST /bills`
- **Detail** (`/bills/:id`):
  - Bill breakdown (all costs)
  - Payment history table (from `GET /payments/bill/:billId`)
  - "Add Payment" button → opens payment form/dialog
  - Progress bar: `paidAmount / totalAmount`
- **Delete**: Confirm dialog → `DELETE /bills/:id`

### 8.9 Payments (embedded in Bill Detail)

- **Create** (dialog or `/payments/new?billId=xxx`):
  - Amount (number input)
  - Method (CASH / TRANSFER / OTHER — radio or select)
  - Note (optional textarea)
  - → `POST /payments` (backend auto-updates bill status)
- **List**: Shown inside Bill Detail page
- **Delete**: Confirm dialog → `DELETE /payments/:id` (backend recalculates bill)

### 8.10 Users / Staff Management (`/users`) — **OWNER only**

- **List**: Table: Name, Email, Phone, Active (badge), Actions
- **Create** (`/users/new`): Form (email, password, fullName, phone) → `POST /users`
- **Edit** (`/users/:id/edit`): Pre-filled form → `PATCH /users/:id`
- **Delete**: Confirm dialog → `DELETE /users/:id`
- **Hide entire section** from sidebar if user role is `staff`

### 8.11 Profile (`/profile`)

- Show current user info (from `GET /auth/profile` or `GET /users/profile`)
- Display: email, fullName, phone, role
- Optional: allow updating own fullName and phone

---

## 9. UI/UX Guidelines

### 9.1 Color Scheme

| Purpose | Color |
|---------|-------|
| Primary | `blue-600` (#2563EB) |
| Success / ACTIVE / PAID | `green-600` |
| Warning / PARTIAL / MAINTENANCE | `amber-500` |
| Danger / TERMINATED / OVERDUE | `red-600` |
| Info / AVAILABLE | `blue-500` |
| Neutral / EXPIRED / UNPAID | `gray-500` |

### 9.2 Status Badge Mapping

```typescript
const STATUS_COLORS = {
  // Room
  AVAILABLE: 'bg-blue-100 text-blue-700',
  OCCUPIED: 'bg-green-100 text-green-700',
  MAINTENANCE: 'bg-amber-100 text-amber-700',
  // Contract
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-700',
  TERMINATED: 'bg-red-100 text-red-700',
  // Bill
  UNPAID: 'bg-gray-100 text-gray-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
};
```

### 9.3 Layout Rules

- **Sidebar**: 280px wide on desktop, collapsible. Contains: Logo, nav links, user avatar at bottom
- **Topbar**: Breadcrumbs, search (optional), notification bell (optional), user dropdown
- **Content area**: Max width 1280px, centered, padding 24px
- **Tables**: Striped rows, hover highlight, action column with icon buttons (Edit, Delete, View)
- **Forms**: Single column on mobile, two columns on desktop for fields that fit
- **Toasts**: Bottom-right, auto-dismiss after 5 seconds

### 9.4 Vietnamese Formatting

```typescript
// Currency
const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
// Output: 5.000.000 ₫

// Date
const formatDate = (dateStr: string): string =>
  format(new Date(dateStr), 'dd/MM/yyyy');
// Output: 08/02/2026
```

---

## 10. Non-Functional Requirements

### 10.1 Error Handling

- **4xx errors**: Show toast with backend `message` field
- **401 Unauthorized**: Auto-refresh token; if fails, redirect to `/login`
- **409 Conflict** (duplicate): Show inline error (e.g., "Email already exists")
- **Network errors**: Show "Connection lost" toast
- **Form validation**: Client-side with Zod BEFORE submitting; show errors inline

### 10.2 Loading States

- Use `Skeleton` components (from shadcn/ui) while data loads
- Disable submit buttons during mutation (show spinner)
- Optimistic updates for delete operations (remove from list immediately)

### 10.3 Security

- NEVER store accessToken in localStorage — memory only (Zustand)
- refreshToken in localStorage (acceptable for SPA with rotation)
- Strip `ownerId` from all request bodies — backend injects it from JWT
- Sanitize all user inputs (React does this by default)

### 10.4 Performance

- React Query stale time: 30 seconds for lists, 60 seconds for detail views
- Prefetch next page data on hover (if pagination is added later)
- Lazy load route components with `next/dynamic` for heavy pages

### 10.5 SEO & Metadata

- Use Next.js `metadata` export in each page for titles
- Dashboard pages don't need SEO (behind auth)
- Auth pages: proper titles ("Login — Rental SaaS", "Register — Rental SaaS")

---

## Quick Start Commands (for the generated project)

```bash
# Create project
pnpm create next-app@latest rental-saas-frontend --typescript --tailwind --eslint --app --src-dir

# Install dependencies
cd rental-saas-frontend
pnpm add axios zustand @tanstack/react-query @tanstack/react-query-devtools
pnpm add react-hook-form @hookform/resolvers zod
pnpm add date-fns lucide-react recharts
pnpm add -D @types/node

# Init shadcn/ui
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card dialog dropdown-menu form input label select table badge skeleton toast sheet avatar alert-dialog separator pagination

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3000/api" > .env.local

# Run
pnpm dev
```

---

**END OF SPECIFICATION — Hand this entire document to Gemini.**
