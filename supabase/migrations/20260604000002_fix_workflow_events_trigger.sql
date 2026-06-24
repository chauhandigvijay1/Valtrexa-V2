-- Migration: Fix workflow_events trigger to use SECURITY DEFINER
-- Without this, database triggers that insert into workflow_events
-- silently fail when RLS policies block the authenticated user context.

-- First, check if the function exists and recreate with SECURITY DEFINER
DO $$
BEGIN
  -- Only proceed if the function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'enqueue_direct_crud_workflow_event'
  ) THEN
    -- Drop and recreate with SECURITY DEFINER
    EXECUTE '
      CREATE OR REPLACE FUNCTION enqueue_direct_crud_workflow_event()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE
        event_kind TEXT;
        entity_kind TEXT;
      BEGIN
        entity_kind := TG_TABLE_NAME;
        IF TG_OP = ''INSERT'' THEN
          event_kind := entity_kind || ''_created'';
        ELSIF TG_OP = ''UPDATE'' THEN
          event_kind := entity_kind || ''_updated'';
        ELSIF TG_OP = ''DELETE'' THEN
          event_kind := entity_kind || ''_deleted'';
        END IF;

         INSERT INTO workflow_events (event_type, entity_id, entity_type, user_id, payload)
         VALUES (
           event_kind,
           COALESCE(NEW.id, OLD.id)::TEXT,
           entity_kind,
           COALESCE(NEW.user_id, OLD.user_id),
           jsonb_build_object(
             ''operation'', TG_OP,
             ''table'', TG_TABLE_NAME,
             ''timestamp'', now()
           )
         );

        RETURN COALESCE(NEW, OLD);
      END;
      $fn$;
    ';
  END IF;
END;
$$;
