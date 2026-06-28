-- Seed Data for DevPulse Supabase Database
-- Compatible with PostgreSQL 15+

-- Clean up existing seed data to ensure repeatability without key collisions.
-- Deleting the user cascadingly deletes services, metrics, alerts, and anomalies.
DELETE FROM incidents;
DELETE FROM users WHERE email = 'test@devpulse.com';

-- 1. Insert Test User
-- email: test@devpulse.com
-- hashed_password: bcrypt hash of "testpassword123" ($2b$12$sP3xsRSd7C5mXURDEaYcduLx6YfCraItfrZchnK8u8.qzQdeg91hO)
INSERT INTO users (id, email, hashed_password, created_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'test@devpulse.com',
  '$2b$12$sP3xsRSd7C5mXURDEaYcduLx6YfCraItfrZchnK8u8.qzQdeg91hO',
  NOW() - INTERVAL '7 days'
);

-- 2. Insert Test Services
-- Payment Service & Order Service owned by test@devpulse.com
INSERT INTO services (id, name, description, owner_id, api_key, is_active, created_at)
VALUES 
  (
    'd3b07384-d113-495f-a559-6c19cd6693d2',
    'Payment Service',
    'Handles customer transactions, subscriptions, and refund processing.',
    '550e8400-e29b-41d4-a716-446655440000',
    'payment_service_api_key_placeholder_12345',
    TRUE,
    NOW() - INTERVAL '5 days'
  ),
  (
    '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    'Order Service',
    'Manages order creation, inventory checks, and checkout workflows.',
    '550e8400-e29b-41d4-a716-446655440000',
    'order_service_api_key_placeholder_67890',
    TRUE,
    NOW() - INTERVAL '5 days'
  );

-- 3. Insert 20 Sample Metric Rows
-- 10 metrics for Payment Service, 10 metrics for Order Service.
-- Covering 'cpu', 'memory', 'error_rate', and 'response_time' types.
INSERT INTO metrics (id, service_id, metric_type, value, timestamp, metadata)
VALUES
  -- Payment Service Metrics (10 rows)
  ('e1f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'cpu', 24.5, NOW() - INTERVAL '10 hours', '{"host": "pay-srv-01"}'),
  ('e2f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'memory', 45.2, NOW() - INTERVAL '9 hours', '{"host": "pay-srv-01"}'),
  ('e3f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'response_time', 120.5, NOW() - INTERVAL '8 hours', '{"host": "pay-srv-01", "endpoint": "/charge"}'),
  ('e4f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'error_rate', 0.01, NOW() - INTERVAL '7 hours', '{"host": "pay-srv-01"}'),
  ('e5f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'cpu', 89.2, NOW() - INTERVAL '6 hours', '{"host": "pay-srv-01"}'), -- Triggers CPU low alert
  ('e6f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'memory', 52.1, NOW() - INTERVAL '5 hours', '{"host": "pay-srv-01"}'),
  ('e7f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'response_time', 1500.0, NOW() - INTERVAL '4 hours', '{"host": "pay-srv-01", "endpoint": "/charge"}'), -- Triggers Critical Latency Alert & Anomaly
  ('e8f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'error_rate', 0.02, NOW() - INTERVAL '3 hours', '{"host": "pay-srv-01"}'),
  ('e9f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'cpu', 28.1, NOW() - INTERVAL '2 hours', '{"host": "pay-srv-01"}'),
  ('e0f13840-a110-4f5f-a559-6c19cd6693d2', 'd3b07384-d113-495f-a559-6c19cd6693d2', 'memory', 55.4, NOW() - INTERVAL '1 hour', '{"host": "pay-srv-01"}'),

  -- Order Service Metrics (10 rows)
  ('f1f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'cpu', 30.1, NOW() - INTERVAL '10 hours', '{"host": "order-srv-01"}'),
  ('f2f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'memory', 78.4, NOW() - INTERVAL '9 hours', '{"host": "order-srv-01"}'), -- Triggers Memory medium alert
  ('f3f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'response_time', 95.0, NOW() - INTERVAL '8 hours', '{"host": "order-srv-01", "endpoint": "/checkout"}'),
  ('f4f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'error_rate', 0.00, NOW() - INTERVAL '7 hours', '{"host": "order-srv-01"}'),
  ('f5f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'cpu', 35.6, NOW() - INTERVAL '6 hours', '{"host": "order-srv-01"}'),
  ('f6f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'memory', 82.1, NOW() - INTERVAL '5 hours', '{"host": "order-srv-01"}'),
  ('f7f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'response_time', 110.2, NOW() - INTERVAL '4 hours', '{"host": "order-srv-01", "endpoint": "/checkout"}'),
  ('f8f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'error_rate', 0.25, NOW() - INTERVAL '3 hours', '{"host": "order-srv-01"}'), -- Triggers Error Rate Anomaly
  ('f9f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'cpu', 32.4, NOW() - INTERVAL '2 hours', '{"host": "order-srv-01"}'),
  ('f0f13840-a110-4f5f-a559-6c19cd6693d2', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'memory', 80.5, NOW() - INTERVAL '1 hour', '{"host": "order-srv-01"}');

-- 4. Insert 3 Sample Alerts
-- 1 critical, 1 medium, 1 low. Linked to the corresponding metric tables.
INSERT INTO alerts (id, service_id, metric_id, severity, message, is_resolved, created_at)
VALUES
  (
    'a1a1a1a1-1111-4444-8888-999999999999',
    'd3b07384-d113-495f-a559-6c19cd6693d2',
    'e5f13840-a110-4f5f-a559-6c19cd6693d2',
    'low',
    'Elevated CPU usage detected on Payment Service: 89.2%',
    FALSE,
    NOW() - INTERVAL '6 hours'
  ),
  (
    'a2a2a2a2-2222-4444-8888-999999999999',
    '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    'f2f13840-a110-4f5f-a559-6c19cd6693d2',
    'medium',
    'High Memory usage warning on Order Service: 78.4%',
    FALSE,
    NOW() - INTERVAL '9 hours'
  ),
  (
    'a3a3a3a3-3333-4444-8888-999999999999',
    'd3b07384-d113-495f-a559-6c19cd6693d2',
    'e7f13840-a110-4f5f-a559-6c19cd6693d2',
    'critical',
    'Severe latency spike on Payment Service /charge endpoint: 1500.0 ms',
    FALSE,
    NOW() - INTERVAL '4 hours'
  );

-- 5. Insert 2 Sample Anomalies
-- 1 for Payment Service, 1 for Order Service.
INSERT INTO anomalies (id, service_id, metric_type, score, confidence, severity, explanation, detected_at, context)
VALUES
  (
    'b1b1b1b1-1111-4444-8888-999999999999',
    'd3b07384-d113-495f-a559-6c19cd6693d2',
    'response_time',
    0.95,
    0.92,
    'critical',
    'Response time for /charge spiked to 1500ms, which is 5.2 standard deviations above the 24-hour rolling mean.',
    NOW() - INTERVAL '4 hours',
    '{"value": 1500.0, "rolling_mean": 115.2, "rolling_std": 265.4}'
  ),
  (
    'b2b2b2b2-2222-4444-8888-999999999999',
    '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    'error_rate',
    0.88,
    0.85,
    'medium',
    'Error rate on /checkout spiked to 25.0%. Rolling average is below 1.0%.',
    NOW() - INTERVAL '3 hours',
    '{"value": 0.25, "rolling_mean": 0.005, "rolling_std": 0.02}'
  );

-- 6. Insert 1 Sample Active Incident
-- Linking both services: root cause is Payment Service, both are affected.
INSERT INTO incidents (id, root_cause_service_id, affected_service_ids, summary, started_at, resolved_at, is_active)
VALUES
  (
    'c1c1c1c1-1111-4444-8888-999999999999',
    'd3b07384-d113-495f-a559-6c19cd6693d2',
    ARRAY['d3b07384-d113-495f-a559-6c19cd6693d2'::uuid, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'::uuid],
    'Cascading degradation: Late-stage database deadlock on Payment Service /charge transaction endpoint caused connection pool exhaustion, leading to 25% checkout failure rates on Order Service.',
    NOW() - INTERVAL '4 hours',
    NULL,
    TRUE
  );
