import { useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface BranchAutocompleteProps {
  readonly branches: ReadonlyArray<string>;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

function BranchAutocomplete({
  branches,
  disabled = false,
  onChange,
  value,
}: BranchAutocompleteProps) {
  const [open, setOpen] = useState(false);

  return (
    <Command className="rounded-lg border" shouldFilter>
      <CommandInput
        disabled={disabled}
        onValueChange={(v) => {
          onChange(v);
          setOpen(true);
        }}
        placeholder="Search or enter branch name..."
        value={value}
      />
      {open && value.length > 0 && (
        <CommandList>
          <CommandEmpty>No branches found</CommandEmpty>
          <CommandGroup>
            {branches.map((branch) => (
              <CommandItem
                key={branch}
                onSelect={() => {
                  onChange(branch);
                  setOpen(false);
                }}
                value={branch}
              >
                {branch}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}

export { BranchAutocomplete };
