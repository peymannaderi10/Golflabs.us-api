import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import { MembershipService } from './membership.service';
import { sanitizeError } from '../../shared/utils/error.utils';

export class MembershipController {
  private service = new MembershipService();

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
      console.error('Error fetching membership plans:', error);
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
      console.error('Error fetching user membership:', error);
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
      console.error('Error subscribing:', error);
      if (error.message?.includes('already have')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  cancel = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const { membershipId } = req.params;
      const { immediate } = req.body || {};

      const result = await this.service.cancelMembership(membershipId, userId, !!immediate);

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
      console.error('Error canceling membership:', error);
      if (error.message === 'Access denied') return res.status(403).json({ error: error.message });
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
      console.error('Error changing plan:', error);
      if (error.message === 'Access denied') return res.status(403).json({ error: error.message });
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // EMPLOYEE
  // =====================================================

  createPlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const plan = await this.service.createPlan(req.body);
      res.status(201).json(plan);
    } catch (error: any) {
      console.error('Error creating plan:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updatePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      const plan = await this.service.updatePlan(planId, req.body);
      res.json(plan);
    } catch (error: any) {
      console.error('Error updating plan:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  deactivatePlan = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { planId } = req.params;
      await this.service.deactivatePlan(planId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deactivating plan:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  getSubscribers = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationId } = req.query;
      if (!locationId) return res.status(400).json({ error: 'locationId is required' });

      const subscribers = await this.service.getSubscribersForLocation(locationId as string);
      res.json(subscribers);
    } catch (error: any) {
      console.error('Error fetching subscribers:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  // =====================================================
  // LOCATION SETTINGS
  // =====================================================

  getLocationSettings = async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const settings = await this.service.getLocationMembershipSettings(locationId);
      res.json(settings);
    } catch (error: any) {
      console.error('Error fetching location membership settings:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };

  updateLocationSettings = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { locationId } = req.params;
      await this.service.updateLocationMembershipSettings(locationId, req.body);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating location membership settings:', error);
      res.status(500).json({ error: sanitizeError(error) });
    }
  };
}
