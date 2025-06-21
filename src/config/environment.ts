export interface EnvironmentConfig {
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
  server: {
    port: number;
  };
}

export function validateEnvironment(): EnvironmentConfig {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("Stripe secret key not found. Make sure you have a .env file with STRIPE_SECRET_KEY set.");
    process.exit(1);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Stripe webhook secret not found. Make sure STRIPE_WEBHOOK_SECRET is set in .env.");
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase credentials not found. Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.");
    process.exit(1);
  }

  return {
    stripe: {
      secretKey: stripeSecretKey,
      webhookSecret: webhookSecret,
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