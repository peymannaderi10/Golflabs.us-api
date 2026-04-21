export {
  authenticateUser,
  authenticateEmployee,
  authenticateKiosk,
  authenticateKioskOrEmployee,
  authenticateGuestBooking,
  enforceLocationScope,
  enforceLocationScopeOptional,
  resolveResourceLocation,
  requireEmployee,
} from './auth.middleware';
export type { AuthenticatedRequest, EmployeeProfile, GuestBookingInfo } from './auth.middleware';
