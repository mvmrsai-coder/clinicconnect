-- 046_clinicconnect_auth_bootstrap_hardening.sql
-- Ensure new authenticated users always receive
-- an account + owner profile during signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (
    name,
    owner_user_id
  )
  VALUES (
    COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    account_id,
    account_role
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_account_id,
    'owner'
  );

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;