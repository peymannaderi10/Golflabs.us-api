export {
  authenticateUser,
  authenticateEmployee,
  authenticateKiosk,
  authenticateKioskOrEmployee,
  enforceLocationScope,
  enforceLocationScopeOptional,
  resolveResourceLocation,
  requireEmployee,
} from './auth.middleware';
export type { AuthenticatedRequest, EmployeeProfile } from './auth.middleware';
