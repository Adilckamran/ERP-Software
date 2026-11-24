-- ============================================================================
-- MIGRATION 0010: SUPABASE AUTH TRIGGER ATTACHMENT & PROFILE/ROLE PROVISIONING
-- ============================================================================
-- Ensures that whenever a user account is created or updated in Supabase Auth
-- (auth.users), public.sync_auth_user_to_app_profile() automatically creates
-- or links public.users, public.user_profiles, and public.manager_cash_accounts
-- with canonical roles:
--   - sikandar@fruityfun.pk -> OWNER (Sikandar Raja)
--   - kamran@fruityfun.pk   -> PRODUCTION_MANAGER (Kamran Bhai)
--   - imran@fruityfun.pk    -> PRODUCTION_MANAGER (Imran Bhai)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_app_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
  v_role TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_dept TEXT;
  v_app_user_id UUID;
BEGIN
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  IF v_email = 'sikandar@fruityfun.pk' THEN
    v_role := 'OWNER';
    v_full_name := 'Sikandar Raja';
    v_phone := '+92-300-8401122';
    v_dept := 'Executive Management';
  ELSIF v_email = 'kamran@fruityfun.pk' THEN
    v_role := 'PRODUCTION_MANAGER';
    v_full_name := 'Kamran Bhai';
    v_phone := '+92-321-4509988';
    v_dept := 'Factory Operations & Production';
  ELSIF v_email = 'imran@fruityfun.pk' THEN
    v_role := 'PRODUCTION_MANAGER';
    v_full_name := 'Imran Bhai';
    v_phone := '+92-322-4509977';
    v_dept := 'Factory Operations & Production';
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'PRODUCTION_MANAGER');
    IF v_role NOT IN ('OWNER', 'PRODUCTION_MANAGER', 'BOOKER') THEN
      v_role := 'PRODUCTION_MANAGER';
    END IF;
    v_full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(v_email, '@', 1));
    v_phone := COALESCE(NEW.raw_user_meta_data ->> 'phone', '+92-300-0000000');
    v_dept := CASE WHEN v_role = 'OWNER' THEN 'Executive Management' ELSE 'Factory Operations & Production' END;
  END IF;

  SELECT id INTO v_app_user_id
  FROM public.users
  WHERE LOWER(email) = v_email
  LIMIT 1;

  IF v_app_user_id IS NULL THEN
    INSERT INTO public.users (id, auth_user_id, email, role, is_active, created_at, updated_at)
    VALUES (NEW.id, NEW.id, v_email, v_role, TRUE, NOW(), NOW())
    RETURNING id INTO v_app_user_id;
  ELSE
    UPDATE public.users
    SET auth_user_id = NEW.id,
        role = v_role,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_app_user_id;
  END IF;

  INSERT INTO public.user_profiles (
    id,
    auth_user_id,
    email,
    full_name,
    phone,
    role,
    is_active,
    department,
    can_record_purchases,
    duty_status,
    last_login_at,
    created_at,
    updated_at
  )
  VALUES (
    v_app_user_id,
    NEW.id,
    v_email,
    v_full_name,
    v_phone,
    v_role,
    TRUE,
    v_dept,
    TRUE,
    'ON_DUTY',
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      is_active = TRUE,
      department = EXCLUDED.department,
      can_record_purchases = TRUE,
      updated_at = NOW();

  IF v_role = 'PRODUCTION_MANAGER' AND to_regclass('public.manager_cash_accounts') IS NOT NULL THEN
    INSERT INTO public.manager_cash_accounts (
      manager_id,
      manager_name,
      total_cash_received,
      total_spent_purchases,
      total_spent_expenses,
      available_balance,
      updated_at
    )
    VALUES (
      v_app_user_id,
      v_full_name,
      0,
      0,
      0,
      0,
      NOW()
    )
    ON CONFLICT (manager_id) DO UPDATE
    SET manager_name = EXCLUDED.manager_name,
        updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_or_updated ON auth.users;
CREATE TRIGGER on_auth_user_created_or_updated
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_app_profile();

-- Backfill any existing auth.users rows into public.users / public.user_profiles
DO $$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    FOR r IN
      SELECT id, email, raw_user_meta_data
      FROM auth.users
      WHERE LOWER(email) IN (
        'sikandar@fruityfun.pk',
        'kamran@fruityfun.pk',
        'imran@fruityfun.pk'
      )
    LOOP
      UPDATE auth.users
      SET updated_at = NOW()
      WHERE id = r.id;
    END LOOP;
  END IF;
END $$;
