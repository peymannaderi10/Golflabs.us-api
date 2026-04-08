"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
function validateEnvironment() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        // Intentionally using console here to avoid circular dependency with logger
        console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
        process.exit(1);
    }
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        // Intentionally using console here to avoid circular dependency with logger
        console.error("Stripe webhook secret not found. Make sure STRIPE_WEBHOOK_SECRET is set in .env.");
        process.exit(1);
    }
    const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || null;
    if (!connectWebhookSecret) {
        console.warn('STRIPE_CONNECT_WEBHOOK_SECRET not set — account.updated events from connected accounts will fail signature verification. Required if you have a Connect-scoped webhook endpoint configured in Stripe.');
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        // Intentionally using console here to avoid circular dependency with logger
        console.error("Supabase credentials not found. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.");
        process.exit(1);
    }
    if (!process.env.NODE_ENV) {
        console.warn("NODE_ENV not set — defaulting to 'development'. Set NODE_ENV=production for production deployments.");
    }
    if (!process.env.RESEND_API_KEY) {
        console.warn("RESEND_API_KEY not set in .env. Email sending will fail.");
    }
    if (!process.env.KIOSK_API_KEY) {
        // Intentionally using console here to avoid circular dependency with logger
        console.warn("KIOSK_API_KEY not set in .env. Kiosk endpoints will reject all requests.");
    }
    if (!process.env.MARKETING_UNSUBSCRIBE_SECRET && !process.env.RESEND_WEBHOOK_SECRET) {
        console.warn("MARKETING_UNSUBSCRIBE_SECRET not set in .env. Marketing unsubscribe links will not work.");
    }
    return {
        stripe: {
            secretKey: stripeSecretKey,
            webhookSecret: webhookSecret,
            connectWebhookSecret,
        },
        supabase: {
            url: supabaseUrl,
            serviceRoleKey: supabaseServiceKey,
        },
        server: {
            port: parseInt(process.env.PORT || '4242', 10),
        },
    };
}
