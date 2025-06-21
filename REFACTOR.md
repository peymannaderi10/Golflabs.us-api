# GolfLabs API - Refactored Structure

## Overview

The GolfLabs API has been refactored from a single monolithic `index.ts` file into a modular monolith structure. This improves maintainability, testability, and separation of concerns while keeping all components in a single deployable unit.

## Project Structure

```
src/
├── config/
│   ├── database.ts        # Supabase initialization
│   ├── stripe.ts          # Stripe configuration
│   └── environment.ts     # Environment variables validation
│
├── modules/
│   ├── bookings/
│   │   ├── booking.routes.ts
│   │   ├── booking.controller.ts
│   │   ├── booking.service.ts
│   │   └── booking.types.ts
│   │
│   ├── payments/
│   │   ├── payment.routes.ts
│   │   ├── payment.controller.ts
│   │   ├── payment.service.ts
│   │   ├── stripe.webhooks.ts
│   │   └── payment.types.ts
│   │
│   ├── pricing/
│   │   ├── pricing.routes.ts
│   │   ├── pricing.controller.ts
│   │   └── pricing.service.ts
│   │
│   ├── locations/
│   │   ├── location.routes.ts
│   │   ├── location.controller.ts
│   │   └── location.service.ts
│   │
│   └── bays/
│       ├── bay.routes.ts
│       ├── bay.controller.ts
│       └── bay.service.ts
│
├── shared/
│   ├── utils/
│   │   └── date.utils.ts      # parseTimeString, createISOTimestamp
│   │
│   └── types/
│       └── common.types.ts
│
├── jobs/
│   ├── scheduler.ts
│   └── expired-reservations.job.ts
│
├── app.ts         # Express app setup
└── server.ts      # Server entry point
```

## Key Benefits

1. **Separation of Concerns**: Each module handles its own domain logic
2. **Maintainability**: Easier to find and fix issues in specific modules
3. **Testability**: Each service/controller can be unit tested independently
4. **Scalability**: Can easily extract modules into microservices later
5. **Team Collaboration**: Different developers can work on different modules
6. **Reusability**: Shared utilities and middleware can be reused across modules

## Architecture Patterns

### Layered Architecture
Each module follows a layered architecture:
- **Routes**: Define HTTP endpoints and route parameters
- **Controllers**: Handle HTTP requests/responses and basic validation
- **Services**: Contain business logic and interact with external services
- **Types**: Define interfaces and type definitions

### Configuration Management
- Environment variables are validated on startup
- Configuration is centralized and imported where needed
- Database and external service connections are configured once

### Background Jobs
- Jobs are separated from the main application logic
- Scheduler manages all background tasks
- Easy to add new jobs or modify existing ones

## Migration Notes

### What Was Moved Where

1. **Environment validation** → `config/environment.ts`
2. **Supabase setup** → `config/database.ts`
3. **Stripe setup** → `config/stripe.ts`
4. **Date utilities** → `shared/utils/date.utils.ts`
5. **Type definitions** → `shared/types/common.types.ts`
6. **Booking logic** → `modules/bookings/`
7. **Payment logic** → `modules/payments/`
8. **Stripe webhooks** → `modules/payments/stripe.webhooks.ts`
9. **Pricing logic** → `modules/pricing/`
10. **Location logic** → `modules/locations/`
11. **Bay logic** → `modules/bays/`
12. **Background jobs** → `jobs/`
13. **Express app setup** → `app.ts`
14. **Server startup** → `server.ts`

### No Functional Changes

All existing functionality has been preserved:
- All API endpoints work exactly the same
- Database interactions are unchanged  
- Stripe webhook handling is identical
- Background job scheduling works the same
- Error handling is maintained

## Development

### Running the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Adding New Features

1. **New Module**: Create a new directory under `modules/` with routes, controller, and service files
2. **New Route**: Add to the appropriate module's routes file
3. **New Job**: Add to `jobs/` directory and register in `scheduler.ts`
4. **Shared Logic**: Add to appropriate file in `shared/`

### Testing

Each module can be tested independently:
- Services can be unit tested in isolation
- Controllers can be tested with mocked services
- Routes can be integration tested

## Backwards Compatibility

The refactored API maintains 100% backwards compatibility:
- All existing endpoints work unchanged
- Request/response formats are identical
- Error responses are the same
- Webhook handling is preserved

## Future Improvements

With this modular structure, we can easily:
1. Add comprehensive error handling middleware
2. Implement request validation middleware
3. Add authentication/authorization middleware
4. Extract modules into separate microservices
5. Add comprehensive logging and monitoring
6. Implement caching layers
7. Add rate limiting and security features 