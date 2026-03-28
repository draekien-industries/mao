import { useAtomValue } from "@effect-atom/atom-react";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { activeStreamCountAtom } from "@/atoms/chat";

const CONCURRENCY_WARNING_THRESHOLD = 5;

function ConcurrencyWarningBanner() {
  const count = useAtomValue(activeStreamCountAtom);

  if (count < CONCURRENCY_WARNING_THRESHOLD) return null;

  return (
    <div className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-xs text-warning-fg">
      <HugeiconsIcon
        className="size-4 shrink-0"
        icon={Alert01Icon}
        strokeWidth={2}
      />
      <span>Performance may degrade with {count} active streams.</span>
    </div>
  );
}

export { ConcurrencyWarningBanner };
