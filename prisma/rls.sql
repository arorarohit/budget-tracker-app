-- Apply with `npm run db:rls`. Each statement is separated by the marker.

-- @statement
CREATE OR REPLACE FUNCTION public.is_household_member(target_household_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."HouseholdMember" AS hm
    WHERE hm."householdId" = target_household_id
      AND hm."userId" = (SELECT auth.uid())::text
  );
$function$;

-- @statement
REVOKE ALL ON FUNCTION public.is_household_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_household_member(text) TO authenticated;

-- @statement
GRANT SELECT ON TABLE public."Household", public."HouseholdMember" TO authenticated;

-- @statement
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public."Account",
  public."Category",
  public."Transaction",
  public."Budget",
  public."CategoryRule"
TO authenticated;

-- @statement
ALTER TABLE public."Household" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Household" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_member_select ON public."Household";
CREATE POLICY household_member_select ON public."Household"
  FOR SELECT TO authenticated
  USING (public.is_household_member("id"));

-- @statement
ALTER TABLE public."HouseholdMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HouseholdMember" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_member_select ON public."HouseholdMember";
CREATE POLICY household_member_select ON public."HouseholdMember"
  FOR SELECT TO authenticated
  USING (public.is_household_member("householdId"));

-- @statement
ALTER TABLE public."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Account" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_household_access ON public."Account";
CREATE POLICY account_household_access ON public."Account"
  FOR ALL TO authenticated
  USING (public.is_household_member("householdId"))
  WITH CHECK (public.is_household_member("householdId"));

-- @statement
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_household_access ON public."Category";
CREATE POLICY category_household_access ON public."Category"
  FOR ALL TO authenticated
  USING (public.is_household_member("householdId"))
  WITH CHECK (public.is_household_member("householdId"));

-- @statement
ALTER TABLE public."Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Transaction" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_household_access ON public."Transaction";
CREATE POLICY transaction_household_access ON public."Transaction"
  FOR ALL TO authenticated
  USING (public.is_household_member("householdId"))
  WITH CHECK (
    public.is_household_member("householdId")
    AND (
      public."Transaction"."accountId" IS NULL
      OR EXISTS (
        SELECT 1
        FROM public."Account" AS a
        WHERE a."id" = public."Transaction"."accountId"
          AND a."householdId" = public."Transaction"."householdId"
      )
    )
    AND (
      public."Transaction"."categoryId" IS NULL
      OR EXISTS (
        SELECT 1
        FROM public."Category" AS c
        WHERE c."id" = public."Transaction"."categoryId"
          AND c."householdId" = public."Transaction"."householdId"
      )
    )
  );

-- @statement
ALTER TABLE public."Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Budget" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_household_access ON public."Budget";
CREATE POLICY budget_household_access ON public."Budget"
  FOR ALL TO authenticated
  USING (public.is_household_member("householdId"))
  WITH CHECK (
    public.is_household_member("householdId")
    AND EXISTS (
      SELECT 1
      FROM public."Category" AS c
      WHERE c."id" = public."Budget"."categoryId"
        AND c."householdId" = public."Budget"."householdId"
    )
  );

-- @statement
ALTER TABLE public."CategoryRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CategoryRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_rule_household_access ON public."CategoryRule";
CREATE POLICY category_rule_household_access ON public."CategoryRule"
  FOR ALL TO authenticated
  USING (public.is_household_member("householdId"))
  WITH CHECK (
    public.is_household_member("householdId")
    AND EXISTS (
      SELECT 1
      FROM public."Category" AS c
      WHERE c."id" = public."CategoryRule"."categoryId"
        AND c."householdId" = public."CategoryRule"."householdId"
    )
  );
