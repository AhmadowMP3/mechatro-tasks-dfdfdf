-- 1) Loosen the profile self-update guard so backend (service_role) calls can activate invited users.
CREATE OR REPLACE FUNCTION public.profiles_guard_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side callers (edge functions with service role) have no auth.uid().
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Admins bypass the guard (managed by profiles_admin_manage).
  IF private.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_master_admin IS DISTINCT FROM OLD.is_master_admin
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.email  IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'Members cannot change identity, role, admin flag, active flag, or status';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Backfill the 3 stuck invited accounts so they can sign in via /auth by name.
UPDATE public.profiles
   SET status = 'active',
       active = true,
       username = CASE WHEN username IS NULL THEN full_name ELSE username END,
       role = CASE WHEN full_name = 'admin2026' THEN 'admin'::public.app_role ELSE role END
 WHERE full_name IN ('ahmad2026','admin2026','member2026')
   AND status = 'pending';

-- 3) Demo data (idempotent).

-- Customers
INSERT INTO public.customers (name_en, name_ar, company, email, phone, default_currency, active, created_by)
SELECT * FROM (VALUES
  ('Aramco Digital',      'أرامكو الرقمية',   'Aramco',       'contact@aramco.example',   '+966501111111', 'USD'::public.currency_code, true, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('SABIC Manufacturing', 'سابك للتصنيع',     'SABIC',        'ops@sabic.example',        '+966502222222', 'USD'::public.currency_code, true, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('Al-Futtaim Group',    'مجموعة الفطيم',    'Al-Futtaim',   'projects@futtaim.example', '+971503333333', 'USD'::public.currency_code, true, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('Damascus Cables',     'كابلات دمشق',      'DamCables',    'sales@damcables.example',  '+963111234567', 'SYP'::public.currency_code, true, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('NEOM Robotics',       'نيوم للروبوتات',   'NEOM',         'tech@neom.example',        '+966504444444', 'USD'::public.currency_code, true, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1))
) AS v(name_en, name_ar, company, email, phone, default_currency, active, created_by)
WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.name_en = v.name_en);

-- Projects
INSERT INTO public.projects (name_en, name_ar, description, color, status, start_date, due_date, created_by)
SELECT * FROM (VALUES
  ('Robotics Line Upgrade', 'ترقية خط الروبوتات',  'Retrofit assembly line with 6-axis arms.', 'amber',  'active'::public.project_status, CURRENT_DATE - 10, CURRENT_DATE + 45, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('Vision QA Pipeline',    'خط فحص الرؤية',        'Camera-based quality inspection system.',  'blue',   'active'::public.project_status, CURRENT_DATE - 20, CURRENT_DATE + 30, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('AGV Fleet Rollout',     'نشر أسطول AGV',        'Autonomous guided vehicles in warehouse.', 'green',  'active'::public.project_status, CURRENT_DATE -  5, CURRENT_DATE + 60, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  ('PLC Migration 2026',    'ترحيل PLC 2026',       'Migrate legacy PLCs to Siemens S7-1500.',  'purple', 'active'::public.project_status, CURRENT_DATE - 30, CURRENT_DATE + 15, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1))
) AS v(name_en, name_ar, description, color, status, start_date, due_date, created_by)
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.name_en = v.name_en);

-- Tasks — distribute across active profiles + new projects
WITH admins AS (
  SELECT id FROM public.profiles WHERE status = 'active' AND active = true ORDER BY created_at LIMIT 6
),
proj AS (
  SELECT id, name_en FROM public.projects WHERE name_en IN ('Robotics Line Upgrade','Vision QA Pipeline','AGV Fleet Rollout','PLC Migration 2026')
),
seed(title, project_name, status, priority, points, offset_days) AS (VALUES
  ('Wire the safety fence sensors',        'Robotics Line Upgrade', 'in_progress', 'high',   5,  3),
  ('Program pick-and-place routine',       'Robotics Line Upgrade', 'todo',        'urgent', 8,  7),
  ('Calibrate torque limits',              'Robotics Line Upgrade', 'in_review',   'normal', 3,  1),
  ('FAT test with client',                 'Robotics Line Upgrade', 'todo',        'high',   8, 20),
  ('Mount overhead cameras',               'Vision QA Pipeline',    'done',        'normal', 5, -2),
  ('Train defect classifier',              'Vision QA Pipeline',    'in_progress', 'high',   8,  5),
  ('Integrate MES over OPC-UA',            'Vision QA Pipeline',    'todo',        'normal', 5, 12),
  ('Write acceptance report',              'Vision QA Pipeline',    'todo',        'low',    2, 18),
  ('Map warehouse for SLAM',               'AGV Fleet Rollout',     'in_progress', 'normal', 5,  4),
  ('Configure charging docks',             'AGV Fleet Rollout',     'todo',        'normal', 3,  9),
  ('Set traffic-control zones',            'AGV Fleet Rollout',     'todo',        'high',   5, 14),
  ('Pilot 3 AGVs on line B',               'AGV Fleet Rollout',     'in_review',   'high',   8,  2),
  ('Export tags from legacy PLC',          'PLC Migration 2026',    'done',        'normal', 3, -5),
  ('Rewire IO drops',                      'PLC Migration 2026',    'in_progress', 'high',   8,  6),
  ('HMI screen migration',                 'PLC Migration 2026',    'todo',        'normal', 5, 10),
  ('Cutover weekend plan',                 'PLC Migration 2026',    'todo',        'urgent', 8, 13)
)
INSERT INTO public.tasks (project_id, title, description, assignee_id, priority, status, progress, due_date, points, created_by, created_at)
SELECT p.id,
       s.title,
       'Auto-seeded demo task for ' || s.project_name,
       (SELECT id FROM admins ORDER BY random() LIMIT 1),
       s.priority::public.task_priority,
       s.status::public.task_status,
       CASE s.status WHEN 'done' THEN 100 WHEN 'in_review' THEN 90 WHEN 'in_progress' THEN 45 ELSE 0 END,
       CURRENT_DATE + s.offset_days,
       s.points,
       (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1),
       now() - (random() * INTERVAL '10 days')
  FROM seed s
  JOIN proj p ON p.name_en = s.project_name
 WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.title = s.title AND t.project_id = p.id);

-- Income entries
INSERT INTO public.income_entries (income_date, source, category, description_en, description_ar, amount, currency, method, created_by)
SELECT * FROM (VALUES
  (CURRENT_DATE -  2, 'Aramco Digital',      'Milestone', 'Robotics phase-1 milestone',  'دفعة المرحلة الأولى للروبوتات', 25000::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  (CURRENT_DATE -  8, 'SABIC Manufacturing', 'Retainer',  'Monthly support retainer',     'أتعاب دعم شهرية',              8000::numeric,  'USD'::public.currency_code, 'bank_transfer'::public.payment_method, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  (CURRENT_DATE - 14, 'NEOM Robotics',       'Consulting','Vision QA consulting week',    'استشارات فحص الرؤية',           12000::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  (CURRENT_DATE - 21, 'Damascus Cables',     'Product',   'Sensor kit sale',              'بيع طقم حساسات',                4500000::numeric, 'SYP'::public.currency_code, 'cash'::public.payment_method,          (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)),
  (CURRENT_DATE - 25, 'Al-Futtaim Group',    'Milestone', 'AGV pilot payment',            'دفعة تجريبية AGV',              18000::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1))
) AS v(income_date, source, category, description_en, description_ar, amount, currency, method, created_by)
WHERE NOT EXISTS (SELECT 1 FROM public.income_entries e WHERE e.income_date = v.income_date AND e.source = v.source AND e.amount = v.amount);

-- Expenses
INSERT INTO public.expenses (expense_date, category_id, vendor, description_en, description_ar, amount, currency, method, status, created_by)
SELECT v.expense_date,
       (SELECT id FROM public.expense_categories ORDER BY random() LIMIT 1),
       v.vendor, v.description_en, v.description_ar, v.amount, v.currency, v.method, v.status,
       (SELECT id FROM public.profiles WHERE is_master_admin LIMIT 1)
  FROM (VALUES
  (CURRENT_DATE -  1, 'Siemens',        'S7-1500 CPU + IO modules',    'وحدة CPU S7-1500 مع IO',    3200::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, 'paid'::public.expense_status),
  (CURRENT_DATE -  4, 'Basler',         'Industrial cameras (x4)',      'كاميرات صناعية × 4',        4800::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, 'paid'::public.expense_status),
  (CURRENT_DATE -  9, 'MiR Robotics',   'AGV lease deposit',            'دفعة إيجار AGV',            6500::numeric, 'USD'::public.currency_code, 'bank_transfer'::public.payment_method, 'paid'::public.expense_status),
  (CURRENT_DATE - 12, 'AWS',            'Cloud hosting (monthly)',      'استضافة سحابية شهرية',      420::numeric,  'USD'::public.currency_code, 'card'::public.payment_method,          'paid'::public.expense_status),
  (CURRENT_DATE - 17, 'Local Cafe',     'Team lunch',                    'غداء الفريق',              300000::numeric,'SYP'::public.currency_code, 'cash'::public.payment_method,          'paid'::public.expense_status),
  (CURRENT_DATE - 22, 'DHL',            'Shipment to Riyadh',            'شحنة إلى الرياض',           650::numeric,  'USD'::public.currency_code, 'bank_transfer'::public.payment_method, 'paid'::public.expense_status),
  (CURRENT_DATE - 27, 'Adobe',          'Design suite subscription',     'اشتراك تصميم',              55::numeric,   'USD'::public.currency_code, 'card'::public.payment_method,          'paid'::public.expense_status)
) AS v(expense_date, vendor, description_en, description_ar, amount, currency, method, status)
WHERE NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.expense_date = v.expense_date AND e.vendor = v.vendor AND e.amount = v.amount);

-- Sample invoice (only if none exists for Aramco Digital)
DO $do$
DECLARE
  v_customer UUID;
  v_project UUID;
  v_creator UUID;
  v_invoice UUID;
BEGIN
  SELECT id INTO v_customer FROM public.customers WHERE name_en = 'Aramco Digital' LIMIT 1;
  SELECT id INTO v_project  FROM public.projects  WHERE name_en = 'Robotics Line Upgrade' LIMIT 1;
  SELECT id INTO v_creator  FROM public.profiles  WHERE is_master_admin LIMIT 1;
  IF v_customer IS NULL OR v_creator IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE customer_id = v_customer AND number = 'INV-DEMO-0001') THEN RETURN; END IF;

  INSERT INTO public.invoices (number, customer_id, project_id, issue_date, due_date, currency, subtotal, tax_rate, tax_amount, total, amount_paid, status, notes_en, created_by)
  VALUES ('INV-DEMO-0001', v_customer, v_project, CURRENT_DATE - 5, CURRENT_DATE + 25, 'USD', 30000, 0, 0, 30000, 15000, 'partially_paid', 'Phase 1 milestone invoice', v_creator)
  RETURNING id INTO v_invoice;

  INSERT INTO public.invoice_items (invoice_id, description_en, description_ar, quantity, unit_price, line_total, sort_order) VALUES
    (v_invoice, 'Engineering hours (phase 1)', 'ساعات هندسية (مرحلة 1)', 120, 200, 24000, 0),
    (v_invoice, 'Hardware kit',                'طقم أجهزة',              1,   6000, 6000,  1);

  INSERT INTO public.invoice_payments (invoice_id, amount, currency, method, paid_at, notes)
  VALUES (v_invoice, 15000, 'USD', 'bank_transfer', CURRENT_DATE - 2, 'Advance payment received');
END $do$;
