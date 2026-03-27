import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RemoveProjectDialogProps {
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly projectName: string;
  readonly sessionCount: number;
}

function RemoveProjectDialog({
  onConfirm,
  onOpenChange,
  open,
  projectName,
  sessionCount,
}: RemoveProjectDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Remove Project</DialogTitle>
          <DialogDescription>
            This will close {sessionCount} session(s) in {projectName}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            variant="destructive"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { RemoveProjectDialog };
