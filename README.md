# GolfLabs - API Backend

## Business Overview

GolfLabs API powers a 24/7 self-service golf simulator facility in Cherryhill, New Jersey. This backend system manages the complete customer journey from booking to facility access, enabling fully automated operations without on-site staff.

Our API handles:
- **Real-time Booking System** - Instant reservations with conflict prevention
- **Payment Processing** - Stripe integration with automatic confirmations
- **Smart Access Control** - Time-limited door unlocking via Shelly switches
- **Automated Notifications** - Email reminders with unlock links
- **Facility Management** - Bay status monitoring and usage analytics

## System Architecture

### Modular Monolith Design

Rather than microservices, we chose a **modular monolith** architecture that provides the benefits of modular organization while maintaining operational simplicity for our scale.

**Why Modular Monolith?**
- **Simplified Deployment** - Single application deployment reduces DevOps complexity
- **Shared Resources** - Efficient use of database connections and memory
- **Cross-Module Communication** - Direct function calls instead of network overhead
- **Easier Development** - Single codebase with clear module boundaries
- **Cost Effective** - Lower infrastructure costs for our business size

### Module Structure

```
src/
├── modules/                 # Business domain modules
│   ├── bookings/           # Reservation management
│   ├── payments/           # Stripe payment processing
│   ├── unlock/             # Door access control
│   ├── email/              # Notification system
│   ├── sockets/            # Real-time communication
│   ├── logs/               # Access and audit logging
│   ├── bays/               # Bay management
│   ├── locations/          # Facility locations
│   └── pricing/            # Dynamic pricing rules
├── jobs/                   # Background tasks
├── shared/                 # Common utilities
└── config/                 # Application configuration
```

Each module follows a consistent pattern:
- `*.routes.ts` - HTTP endpoint definitions
- `*.controller.ts` - Request/response handling
- `*.service.ts` - Business logic implementation
- `*.types.ts` - TypeScript interfaces

## Technology Stack

### Core Framework
- **Node.js** - Runtime environment
- **Express.js** - Web application framework
- **TypeScript** - Type-safe JavaScript development
- **Socket.io** - Real-time bidirectional communication

### Database & Storage
- **Supabase** - PostgreSQL database with real-time features
- **Custom Functions** - Stored procedures for complex booking logic
- **Row Level Security** - Database-level access control

### External Integrations
- **Stripe** - Payment processing and webhook handling
- **Resend** - Transactional email delivery
- **Shelly API** - IoT switch control for door unlocking
- **Date-fns-tz** - Timezone-aware date handling

### Infrastructure Services
- **Background Jobs** - Scheduled tasks for reminders and cleanup
- **Webhook Processing** - Stripe and email event handling
- **Health Monitoring** - System status endpoints
- **CORS Support** - Cross-origin resource sharing

## Key Features

### 🔒 Smart Access Control
- Time-limited unlock tokens in booking reminder emails
- Direct Shelly switch integration for door control
- Automatic expiration when sessions end
- Comprehensive access logging

### 💳 Payment Processing
- Stripe Payment Intents for secure transactions
- Webhook-driven booking confirmations
- Automatic refund processing for cancellations
- 24-hour cancellation policy enforcement

### 📧 Automated Communications
- Booking confirmation emails with details
- 15-minute reminder emails with unlock links
- Light/dark mode email templates
- Failed delivery tracking and retry logic

### 🏌️ Real-time Bay Management
- Socket.io for instant kiosk communication
- Bay status monitoring and updates
- Conflict prevention for overlapping bookings
- Dynamic pricing based on time slots

### 📊 Comprehensive Logging
- Access attempt tracking
- Performance monitoring
- Security audit trails
- Business intelligence data collection

## Background Jobs

Automated tasks handle critical business operations:

- **Reminder Job** - Sends 15-minute booking reminders with unlock tokens
- **Expired Reservations** - Cleans up unpaid bookings automatically
- **Notifications** - Handles failed email delivery attempts
- **Scheduler** - Manages job execution timing

## Database Design

### Core Tables
- `bookings` - Reservation records with status tracking
- `payments` - Stripe payment intent management
- `access_logs` - Security and usage audit trail
- `bays` - Facility bay configuration and status
- `pricing_rules` - Time-based pricing configuration

### Advanced Features
- **Timezone Support** - Location-specific time handling
- **Conflict Prevention** - Database constraints prevent double-booking
- **Audit Trails** - Complete booking lifecycle tracking
- **Performance Optimization** - Indexed queries for fast responses

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Configuration

Required environment variables:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret
RESEND_API_KEY=your_resend_key
PORT=4242
```

## API Endpoints

### Booking Management
- `POST /bookings/reserve` - Create booking reservation
- `POST /bookings/:id/create-payment-intent` - Initialize payment
- `GET /users/:id/bookings/*` - User booking history

### Facility Access
- `POST /unlock` - Process door unlock requests
- `GET /bays` - Bay availability and status
- `GET /locations` - Facility information

### Business Operations
- `POST /calculate-price` - Dynamic pricing calculation
- `GET /pricing-rules` - Current pricing configuration
- `POST /stripe-webhook` - Payment event processing

## Project Status

- ✅ Booking system with payment processing
- ✅ Automated email notifications
- ✅ Smart door unlock functionality
- ✅ Real-time kiosk communication
- ✅ Comprehensive audit logging
- 🚧 Advanced analytics dashboard (planned)
- 📋 Multi-location support (future)

## Architecture Benefits

The modular monolith approach provides:

1. **Developer Productivity** - Single repository with clear boundaries
2. **Operational Simplicity** - One application to deploy and monitor
3. **Performance** - No network latency between modules
4. **Consistency** - Shared database transactions across modules
5. **Scalability** - Easy to extract modules to microservices later

---

*GolfLabs API - Powering automated golf simulation experiences*
