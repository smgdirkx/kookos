import { type ReactNode, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Bevestigen",
  cancelLabel = "Annuleren",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="fixed inset-0 bg-black/40 animate-fade-in cursor-default"
        onClick={onCancel}
        aria-label="Sluiten"
        tabIndex={-1}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scale-in">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="ghost" size="md" fullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} size="md" fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
};

type ConfirmState = ConfirmOptions & { open: boolean };

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<ConfirmState>({ open: false, title: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const modal = (
    <ConfirmModal
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return [confirm, modal];
}
