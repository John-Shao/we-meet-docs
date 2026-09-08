import { ReactNode } from 'react';

import { ButtonCloseModal } from './ButtonCloseModal';

/** Shared WeMeet title bar. Its marker scopes the dialog theme away from document content. */
export function ModalHeader({
  title,
  documentTitle,
  documentTitleLabel,
  onClose,
  closeLabel,
  closeDisabled,
  titleId,
  titleTestId,
  children,
}: {
  title: ReactNode;
  documentTitle?: string;
  documentTitleLabel?: string;
  onClose: () => void;
  closeLabel: string;
  closeDisabled?: boolean;
  titleId?: string;
  titleTestId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="wm-modal-header">
      <h2 className="wm-modal-heading" id={titleId} data-testid={titleTestId}>
        <span className="wm-modal-title">{title}</span>
        {documentTitle && (
          <span className="wm-modal-document-title" title={documentTitle}>
            {documentTitleLabel ?? documentTitle}
          </span>
        )}
      </h2>
      {children}
      <ButtonCloseModal
        onClick={onClose}
        aria-label={closeLabel}
        disabled={closeDisabled}
      />
    </div>
  );
}
