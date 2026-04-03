import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { MembershipService } from './membership.service';
import { sanitizeError } from '../../shared/utils/error.utils';
import { logger } from '../../shared/utils/logger';

export class MembershipController {
  private service = new MembershipService();

  /** Verify the authenticated employee belongs to the requested location */
  private validateEmployeeLocation(req: AuthenticatedRequest, locationId: string): string | null {
    const employeeLocationId = req.employeeProfile?.location_id;
    if (!employeeLocationId || employeeLocationId !== locationId) {
      return 'Access denied: you do not belong to this location';
    }
    return null;
  }

  // =====================================================
  // PUBLIC / CUSTOMER
  // =====================================================

  getPlans = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ error: 'locationId is required' });

      const plans = await this.service.getPlansForLocation(locationId as string);
      res.json(plans);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching membership plans');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getMyMembership = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { locationId } = req.query;
      if (!userId || !locationId) return res.status(400).json({ error: 'locationId is required' });

      const membership = await this.service.getUserMembership(userId, locationId as string);
      res.json({ membership });
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching user membership');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  createBillingPortalSession = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { locationId, returnUrl } = req.body;
      if (!locationId || !returnUrl) {
        return res.status(400).json({ error: 'locationId and returnUrl are required' });
      }

      const result = await this.service.createBillingPortalSession(userId, locationId, returnUrl);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating billing portal session');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  subscribe = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { planId, billingInterval } = req.body;
      if (!planId || !billingInterval) {
        return res.status(400).json({ error: 'planId and billingInterval are required' });
      }

      if (!['monthly', 'annual'].includes(billingInterval)) {
        return res.status(400).json({ error: 'billingInterval must be monthly or annual' });
      }

      const result = await this.service.subscribe(userId, planId, billingInterval);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error subscribing');
      if (error.message?.includes('already have')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  changePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { membershipId } = req.params;
      const { newPlanId } = req.body;
      if (!newPlanId) return res.status(400).json({ error: 'newPlanId is required' });

      await this.service.changePlan(membershipId, userId, newPlanId);
      res.json({ success: true, message: 'Plan changed successfully' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error changing plan');
      if (error.message === 'Access denied') return res.status(403).json({ error: error.message });
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // EMPLOYEE
  // =====================================================

  createPlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const locationErr = this.validateEmployeeLocation(req, req.body.locationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      const plan = await this.service.createPlan(req.body);
      res.status(201).json(plan);
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating plan');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updatePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;

      const planLocationId = await this.service.getPlanLocationId(planId);
      if (!planLocationId) return res.status(404).json({ error: 'Plan not found' });

      const locationErr = this.validateEmployeeLocation(req, planLocationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      const plan = await this.service.updatePlan(planId, req.body);
      res.json(plan);
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating plan');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deactivatePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;

      const planLocationId = await this.service.getPlanLocationId(planId);
      if (!planLocationId) return res.status(404).json({ error: 'Plan not found' });

      const locationErr = this.validateEmployeeLocation(req, planLocationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      await this.service.deactivatePlan(planId);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error deactivating plan');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  employeeCancelMembership = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { membershipId } = req.params;
      const { immediate } = req.body || {};

      const membershipLocationId = await this.service.getMembershipLocationId(membershipId);
      if (!membershipLocationId) return res.status(404).json({ error: 'Membership not found' });

      const locationErr = this.validateEmployeeLocation(req, membershipLocationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      const result = await this.service.cancelMembership(membershipId, '', !!immediate, true);

      if (immediate) {
        const refundDollars = result.refundAmount ? (result.refundAmount / 100).toFixed(2) : '0.00';
        res.json({
          success: true,
          message: `Membership canceled immediately. Refund of $${refundDollars} issued.`,
          refundAmount: result.refundAmount || 0,
        });
      } else {
        res.json({ success: true, message: 'Membership will be canceled at the end of the billing period' });
      }
    } catch (error: any) {
      logger.error({ err: error }, 'Error canceling membership (employee)');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  employeeChangePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { membershipId } = req.params;
      const { newPlanId } = req.body;
      if (!newPlanId) return res.status(400).json({ error: 'newPlanId is required' });

      const membershipLocationId = await this.service.getMembershipLocationId(membershipId);
      if (!membershipLocationId) return res.status(404).json({ error: 'Membership not found' });

      const locationErr = this.validateEmployeeLocation(req, membershipLocationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      await this.service.changePlan(membershipId, '', newPlanId, true);
      res.json({ success: true, message: 'Plan changed successfully' });
    } catch (error: any) {
      logger.error({ err: error }, 'Error changing plan (employee)');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getSubscribers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ error: 'locationId is required' });

      const locationErr = this.validateEmployeeLocation(req, locationId as string);
      if (locationErr) return res.status(403).json({ error: locationErr });

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const result = await this.service.getSubscribersForLocation(locationId as string, page, pageSize);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching subscribers');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // LOCATION SETTINGS
  // =====================================================

  getLocationSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationId } = req.params;
      const locationErr = this.validateEmployeeLocation(req, locationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      const settings = await this.service.getLocationMembershipSettings(locationId);
      res.json(settings);
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching location membership settings');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updateLocationSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationId } = req.params;
      const locationErr = this.validateEmployeeLocation(req, locationId);
      if (locationErr) return res.status(403).json({ error: locationErr });

      await this.service.updateLocationMembershipSettings(locationId, req.body);
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, 'Error updating location membership settings');
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
}
