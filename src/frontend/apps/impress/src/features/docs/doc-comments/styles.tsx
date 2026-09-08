import { createGlobalStyle, css } from 'styled-components';

export const DocsCommentsStyle = createGlobalStyle<{
  canSeeComment: boolean;
  currentUserAvatarUrl?: string;
}>`
  .--docs--main-editor.bn-root,
  .--docs--main-editor.bn-root .ProseMirror,
  .--docs--comments-sidebar.bn-root,
  .--docs--comments-sidebar.bn-root .ProseMirror {
    // Comments marks in the editor
    .bn-editor {
      // Resets blocknote comments styles
      .bn-thread-mark,
      .bn-thread-mark-selected {
        background-color: transparent;
      }

      ${({ canSeeComment }) =>
        canSeeComment &&
        css`
          .bn-thread-mark:not([data-orphan='true']) {
            background-color: color-mix(
              in srgb,
              var(--wm-status-warning-container) 40%,
              transparent
            );
            border-bottom: 2px solid var(--wm-status-warning-default);

            mix-blend-mode: normal;

            transition:
              background-color var(--c--globals--transitions--duration),
              border-bottom-color var(--c--globals--transitions--duration);

            &:has(.bn-thread-mark-selected) {
              background-color: var(--wm-status-warning-container);
            }
          }

          .bn-thread-mark[data-orphan='true']:has(> .bn-thread-mark-selected) {
            background-color: color-mix(
              in srgb,
              var(--wm-action-selected-container) 40%,
              transparent
            );
            border-bottom: 2px solid var(--wm-border-focus);

            mix-blend-mode: normal;

            transition:
              background-color var(--c--globals--transitions--duration),
              border-bottom-color var(--c--globals--transitions--duration);
          }
        `}

      [data-show-selection] {
        color: HighlightText;
      }
    }

    em-emoji-picker {
      box-shadow: var(--wm-shadow-overlay);
      min-height: 420px;
    }

    // Thread modal
    .bn-thread {
      box-sizing: border-box;
      width: min(400px, calc(100vw - 32px));
      min-width: 0;
      max-width: calc(100vw - 32px);
      border: 1px solid var(--wm-border-subtle);
      border-radius: var(--wm-radius-card);
      background: var(--wm-surface-default);
      color: var(--wm-text-primary);
      font: var(--wm-font-body-medium);
      max-height: min(500px, 60dvh);
      padding: var(--c--globals--spacings--xxs) var(--c--globals--spacings--xxxs);
      box-shadow: var(--wm-shadow-overlay);
      margin: 0;
      gap: 0;
      overflow: auto;

      .bn-default-styles {
        font-family: var(--wm-font-family);
      }

      .bn-container {
        height: auto;
        background: transparent;
      }

      .bn-editor {
        background: transparent;
      }

      .bn-editor[contenteditable='true'] {
        box-sizing: border-box;
        min-height: var(--wm-control-height-compact);
        padding: var(--wm-space-xs) var(--wm-space-sm);
        border: 1px solid var(--wm-border-default);
        border-radius: var(--wm-radius-control);
      }

      .bn-comment-actions button {
        border-radius: var(--wm-radius-control);
        font: var(--wm-font-label-large);
      }

      .bn-block {
        font-size: var(--wm-font-size-body-medium);
      }

      .bn-inline-content:has(> .ProseMirror-trailingBreak:only-child):before {
        font-style: normal;
        font-size: var(--wm-font-size-body-medium);
      }

      & .bn-thread-comments {
        gap: var(--c--globals--spacings--xxxs);
      }

      .bn-thread-comment {
        padding: 8px;
        min-width: 0;
        flex-wrap: nowrap;
        gap: 0px;
        flex-direction: column;
        align-items: initial;

        & > div:first-child {
          flex-direction: row;
        }

        & .bn-editor {
          padding-left: var(--c--globals--spacings--lg);
          .bn-inline-content {
            color: var(--wm-text-primary);
          }
        }

        // Emoji
        & .bn-badge-group {
          padding-left: var(--c--globals--spacings--lg);
          .bn-badge label {
            padding: var(--c--globals--spacings--0)
              var(--c--globals--spacings--st);
            background: none;
            border: 1px solid var(--wm-border-default);
            border-radius: var(--c--globals--spacings--st);
            height: var(--wm-control-height-compact);
          }
        }

        // Top bar (Name / Date / Actions) when actions displayed
        &:has(.bn-comment-actions) {
          & > .mantine-Group-root:first-child {
            right: 0.3rem !important;
            top: 0.3rem !important;
            /* 渐变起点要**不透明**面色(原值就是 #fff)。别用
               background--semantic--contextual--primary —— 那是 5% alpha 的叠加色,
               渐变会几乎看不见,盖不住底下的评论文字。 */
            background: linear-gradient(
              to left,
              var(--wm-surface-default) 90%,
              transparent 100%
            );
          }

          .bn-menu-dropdown {
            box-shadow: var(--wm-shadow-overlay);
          }
        }

        // Top bar (Name / Date / Actions)
        & > .mantine-Group-root {
          flex-wrap: nowrap;
          max-width: 100%;
          gap: 0.5rem;

          & > .mantine-Text-root {
            min-width: 0;
            overflow-wrap: anywhere;
            color: var(--wm-text-primary);
            font: var(--wm-font-label-large);
          }

          // Date
          span.mantine-focus-auto {
            color: var(--wm-text-secondary);
            font: var(--wm-font-body-small);
            font-weight: 400;
            margin-left: var(--c--globals--spacings--2xs) !important;
          }

          .bn-comment-actions {
            background: transparent;
            border: none;

            .mantine-Button-root {
              background-color: transparent;
              height: var(--wm-control-height-compact);
              width: var(--wm-control-height-compact);
              padding: var(--c--globals--spacings--0);

              &:hover {
                background-color: var(--wm-surface-muted);
              }
            }

            button[role='menuitem'] svg {
              color: var(--wm-icon-secondary);
            }
          }

          & svg {
            color: var(--wm-action-primary-background);
          }
        }

        // Actions button edit comment
        .bn-root + .bn-comment-actions-wrapper {
          margin-top: var(--c--globals--spacings--2xs);
          .bn-comment-actions {
            flex-direction: row-reverse;
            flex-wrap: wrap;
            background: none;
            border: none;
            gap: 0.4rem !important;

            & > button {
              height: var(--wm-control-height-compact);
              padding-inline: var(--c--globals--spacings--st);
              border: 1px solid var(--wm-action-primary-background);
              background: var(--wm-action-primary-background);
              color: var(--wm-action-primary-foreground);

              &:hover {
                background-color: var(--wm-action-primary-background);
              }

              &:last-child {
                /* 线框按钮的底(原值 white),要不透明面色而非 5% 叠加色。 */
                background: var(--wm-surface-default);
                border: 1px solid var(--wm-border-subtle);
                color: var(--wm-action-primary-background);
              }
            }
          }
        }
      }

      // Input to add a new comment
      .bn-thread-composer,
      &:has(> .bn-comment-editor + .bn-comment-actions-wrapper) {
        padding: 0.5rem 8px;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--wm-space-sm);

        .bn-container.bn-comment-editor {
          min-width: 0;
          flex: 1 1 calc(100% - var(--wm-icon-button-default) - var(--wm-space-sm));
        }

        &::before {
          content: '';
          width: var(--wm-icon-button-default);
          height: var(--wm-icon-button-default);
          flex: 0 0 var(--wm-icon-button-default);
          border-radius: var(--wm-radius-control);
          background-image: ${({ currentUserAvatarUrl }) =>
            currentUserAvatarUrl ? `url("${currentUserAvatarUrl}")` : 'none'};
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;
        }

        & .bn-block-content:has(.ProseMirror-trailingBreak:only-child):after {
          color: var(--wm-text-secondary);
          font-style: normal;
        }
      }

      // Actions button send comment
      .bn-thread-composer .bn-comment-actions-wrapper,
      &:not(.selected) .bn-comment-actions-wrapper {
        flex-basis: fit-content;
        margin-inline-start: auto;

        .bn-action-toolbar.bn-comment-actions {
          border: none;
          background-color: transparent;

          button {
            font: var(--wm-font-label-large);
            color: var(--wm-action-primary-foreground);
            background: var(--wm-action-primary-background);
            width: auto;
            height: var(--wm-control-height-compact);
            padding: var(--wm-space-xs) var(--wm-space-sm);

            &:disabled {
              background: var(--wm-surface-muted);
              color: var(--wm-text-disabled);
            }
          }
        }
      }

      // Input first comment
      &:not(.selected) {
        gap: 0.5rem;

        .bn-container.bn-comment-editor {
          min-width: 0;

          .ProseMirror.bn-editor {
            cursor: text;
          }
        }
      }
    }
  }

  /**
  * Styles for the comments sidebar
  */
  .--docs--comments-sidebar.bn-root{
    flex: 1;
    min-height: 0;
    overflow: auto;

    .bn-editor[contenteditable="false"]{
      &:focus-visible {
        outline: 2px solid var(--wm-border-focus);
        outline-offset: -2px;
      }
    }

    .bn-threads-sidebar {
      gap: 0;
      border-radius: 0;
      min-height: 100%;

      .bn-thread-expand-prompt p {
        font-size: var(--wm-font-size-body-small);
      }

      .bn-thread {
        margin: 0;
        max-width: 100%;
        width: 100%;
        min-width: 0;
        overflow: visible;
        padding: var(--c--globals--spacings--xxs) var(--c--globals--spacings--xxxs);
        border: none;
        border-radius: 0;
        box-shadow: none;
        border-bottom: 1px solid var(--wm-border-subtle);

        &.selected {
          border: none;
          box-shadow: inset 3px 0 var(--wm-border-focus);
          background: var(--wm-surface-muted);
          max-height: none;
        }

        &:hover {
          background: var(--wm-surface-muted);
        }

        & .bn-header-text {
          display: none;
        }

        &.bn-thread-orphaned {
          & .bn-header-text {
            display: block;
            padding-inline: var(--c--globals--spacings--xs);
          }
        }

        .bn-thread-comment {
          padding: var(--c--globals--spacings--xs);

          &:has(.bn-comment-actions) {
            & > .mantine-Group-root:first-child {
              background: linear-gradient(
                to left,
                var(--wm-surface-muted) 90%,
                rgba(255, 255, 255, 0) 100%
              );
            }

            .bn-menu-dropdown {
              box-shadow: var(--wm-shadow-overlay);
            }
          }
        }
      }
    }
  }
`;
