import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  expandRoleVariants,
  normalizeRoleLabel,
  normalizeRoles,
  ROLE_OPTIONS,
} from "@/lib/role-taxonomy";

export function RoleMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [customRole, setCustomRole] = useState("");
  const selected = useMemo(() => normalizeRoles(value), [value]);

  const addRole = (role: string) => {
    const normalized = normalizeRoleLabel(role);
    if (!normalized) return;
    onChange(normalizeRoles([...selected, normalized]));
    setCustomRole("");
  };

  const removeRole = (role: string) => {
    onChange(selected.filter((item) => item.toLowerCase() !== role.toLowerCase()));
  };

  const suggestions = useMemo(
    () =>
      ROLE_OPTIONS.filter(
        (role) => !selected.some((item) => item.toLowerCase() === role.toLowerCase()),
      ),
    [selected],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Preferred Roles</Label>
        <div className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {selected.length ? (
              selected.map((role) => (
                <Badge key={role} variant="secondary" className="gap-2 pr-1">
                  {role}
                  <button
                    type="button"
                    className="rounded px-1 text-xs hover:bg-background/70"
                    onClick={() => removeRole(role)}
                    aria-label={`Remove ${role}`}
                  >
                    x
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                Select at least 5 roles. Search will expand role variants automatically.
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((role) => (
              <Button
                key={role}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => addRole(role)}
                className="text-muted-foreground"
              >
                + {role}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={customRole}
              onChange={(event) => setCustomRole(event.target.value)}
              placeholder="Add a custom role"
            />
            <Button type="button" variant="outline" onClick={() => addRole(customRole)}>
              Add
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Expanded search variants:{" "}
            {selected.length
              ? normalizeRoles(selected.flatMap((role) => expandRoleVariants(role))).join(", ")
              : "Choose roles to preview synonyms."}
          </div>
        </div>
      </div>
    </div>
  );
}
