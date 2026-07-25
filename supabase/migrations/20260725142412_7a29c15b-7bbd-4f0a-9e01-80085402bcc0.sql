
-- Roles enum + user_roles table (per project rules: roles NEVER on profiles)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Security-definer role checker
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- Admins can see everyone's roles (for the admin data hub)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enrich detection_feedback with ML-friendly fields
ALTER TABLE public.detection_feedback
  ADD COLUMN IF NOT EXISTS sub_label text,
  ADD COLUMN IF NOT EXISTS raw_scores jsonb DEFAULT '{}'::jsonb;

-- Admins can see the entire labeled corpus for ML export
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.detection_feedback;
CREATE POLICY "Admins can view all feedback"
  ON public.detection_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all sessions" ON public.detection_sessions;
CREATE POLICY "Admins can view all sessions"
  ON public.detection_sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all households" ON public.households;
CREATE POLICY "Admins can view all households"
  ON public.households FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all household members" ON public.household_members;
CREATE POLICY "Admins can view all household members"
  ON public.household_members FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
