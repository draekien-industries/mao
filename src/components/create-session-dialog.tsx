import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { useEffect, useState } from "react";
import {
  branchesAtom,
  checkWorktreeExistsAtom,
  createSessionAtom,
  loadBranchesAtom,
} from "@/atoms/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { BranchAutocomplete } from "./branch-autocomplete";

interface CreateSessionDialogProps {
  readonly cwd: string;
  readonly isGitRepo: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly projectId: number;
  readonly projectName: string;
  readonly worktreeBasePath: string | null;
}

function CreateSessionDialog({
  cwd,
  isGitRepo,
  onOpenChange,
  open,
  projectId,
  projectName,
  worktreeBasePath,
}: CreateSessionDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [useWorktree, setUseWorktree] = useState(true); // D-11: checked by default
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [worktreeCheck, setWorktreeCheck] = useState<{
    exists: true;
    path: string;
  } | null>(null);

  // Read branches from shared atom populated by loadBranchesAtom
  const branches = useAtomValue(branchesAtom);

  // Get dispatch functions via useAtomSet (same pattern as sendMessageAtom)
  const createSession = useAtomSet(createSessionAtom);
  const loadBranches = useAtomSet(loadBranchesAtom);
  const checkWorktreeExists = useAtomSet(checkWorktreeExistsAtom, {
    mode: "promise",
  });

  // Load branches when dialog opens (only for git repos)
  useEffect(() => {
    if (open && isGitRepo) {
      loadBranches(cwd);
    }
    if (!open) {
      // Reset state on close
      setBranchName("");
      setUseWorktree(true);
      setIsSubmitting(false);
      setWorktreeCheck(null);
    }
  }, [open, isGitRepo, cwd, loadBranches]);

  // D-12: Debounced worktree existence check
  useEffect(() => {
    if (!(open && isGitRepo && useWorktree && branchName.length > 0)) {
      setWorktreeCheck(null);
      return;
    }

    const timeout = setTimeout(() => {
      checkWorktreeExists({ cwd, branchName }).then(
        (result) => {
          if (result.exists && result.path !== null) {
            setWorktreeCheck({ exists: true, path: result.path });
          } else {
            setWorktreeCheck(null);
          }
        },
        () => {
          setWorktreeCheck(null);
        },
      );
    }, 300);

    return () => clearTimeout(timeout);
  }, [branchName, useWorktree, open, isGitRepo, cwd, checkWorktreeExists]);

  const handleCreate = () => {
    setIsSubmitting(true);

    createSession({
      projectId,
      cwd,
      branchName,
      useWorktree: isGitRepo && useWorktree,
      worktreeBasePath: worktreeBasePath ?? ".worktrees",
      isGitRepo,
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            Create a session in {projectName}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="branch">Branch</FieldLabel>
            {isGitRepo ? (
              <BranchAutocomplete
                branches={branches}
                onChange={setBranchName}
                value={branchName}
              />
            ) : (
              <FieldDescription>
                Git features unavailable for this project.
              </FieldDescription>
            )}
          </Field>
          {isGitRepo && (
            <Field>
              <Field orientation="horizontal">
                <Checkbox
                  checked={useWorktree}
                  id="use-worktree"
                  onCheckedChange={(checked) =>
                    setUseWorktree(checked === true)
                  }
                />
                <FieldLabel className="font-normal" htmlFor="use-worktree">
                  Create worktree
                </FieldLabel>
              </Field>
              <FieldDescription>
                Isolates work in a separate directory
              </FieldDescription>
              {useWorktree && branchName && (
                <FieldDescription>
                  {worktreeBasePath ?? ".worktrees"}/{branchName}
                </FieldDescription>
              )}
              {worktreeCheck?.exists && (
                <FieldDescription className="text-amber-600 dark:text-amber-400">
                  A worktree for &apos;{branchName}&apos; already exists at{" "}
                  {worktreeCheck.path}. It will be reused.
                </FieldDescription>
              )}
            </Field>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={isSubmitting || (!branchName && isGitRepo)}
            onClick={handleCreate}
          >
            {isSubmitting && <Spinner data-icon="inline-start" />}
            {isSubmitting
              ? "Creating..."
              : worktreeCheck?.exists
                ? "Use Existing Worktree"
                : "Create Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CreateSessionDialog };
