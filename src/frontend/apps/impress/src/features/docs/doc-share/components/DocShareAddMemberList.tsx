import {
  Button,
  VariantType,
  useToastProvider,
} from '@gouvfr-lasuite/cunningham-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Box, Card } from '@/components';
import { useCunninghamTheme } from '@/cunningham';
import { Doc, Role } from '@/docs/doc-management';
import { User } from '@/features/auth';
import { useResponsiveStore } from '@/stores';

import { useCreateDocAccess } from '../api';

import { DocRoleDropdown } from './DocRoleDropdown';
import { DocShareAddMemberListItem } from './DocShareAddMemberListItem';

type Props = {
  doc: Doc;
  selectedUsers: User[];
  onRemoveUser?: (user: User) => void;
  onBusyChange?: (busy: boolean) => void;
  afterInvite?: (remaining: User[]) => void;
};
export const DocShareAddMemberList = ({
  doc,
  selectedUsers,
  onRemoveUser,
  afterInvite,
  onBusyChange,
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToastProvider();
  const { isSmallMobile } = useResponsiveStore();
  const [isLoading, setIsLoading] = useState(false);
  const { spacingsTokens } = useCunninghamTheme();
  const [invitationRole, setInvitationRole] = useState<Role>(Role.READER);
  const canShare = doc.abilities.accesses_manage;
  const running = useRef(false);
  const { mutateAsync: createDocAccess } = useCreateDocAccess();

  const onInvite = async () => {
    if (running.current || !canShare || !selectedUsers.length) {
      return;
    }
    running.current = true;
    setIsLoading(true);
    onBusyChange?.(true);
    try {
      const settled = await Promise.allSettled(
        selectedUsers.map((user) =>
          createDocAccess({
            role: invitationRole,
            docId: doc.id,
            memberId: user.id,
          }),
        ),
      );
      const remaining = selectedUsers.filter(
        (_, index) => settled[index].status === 'rejected',
      );
      if (remaining.length) {
        toast(
          t('Some users could not be added. Retry the remaining users.'),
          VariantType.ERROR,
        );
      }
      afterInvite?.(remaining);
    } finally {
      running.current = false;
      setIsLoading(false);
      onBusyChange?.(false);
    }
  };
  const inviteLabel =
    selectedUsers.length === 1
      ? t('Invite {{name}}', {
          name:
            selectedUsers[0].full_name ||
            selectedUsers[0].short_name ||
            t('Unknown user'),
        })
      : t('Invite {{count}} members', { count: selectedUsers.length });

  return (
    <Card
      className="--docs--doc-share-add-member-list"
      data-testid="doc-share-add-member-list"
      $direction={isSmallMobile ? 'column' : 'row'}
      $align={isSmallMobile ? 'stretch' : 'center'}
      $padding={spacingsTokens.sm}
      $scope="surface"
      $theme="tertiary"
      $variation=""
      $border="1px solid var(--c--contextuals--border--surface--primary)"
      $margin={{ bottom: 'sm' }}
      $gap={spacingsTokens.xs}
    >
      <Box
        $direction="row"
        $align="center"
        $wrap="wrap"
        $flex={1}
        $gap={spacingsTokens.xs}
      >
        {selectedUsers.map((user) => (
          <DocShareAddMemberListItem
            key={user.id}
            user={user}
            onRemoveUser={isLoading ? undefined : onRemoveUser}
          />
        ))}
      </Box>
      <Box
        $direction="row"
        $align="center"
        $gap={spacingsTokens.xs}
        $margin={{ left: isSmallMobile ? 'auto' : '' }}
      >
        <DocRoleDropdown
          canUpdate={canShare && !isLoading}
          currentRole={invitationRole}
          rolesAllowed={[Role.READER, Role.COMMENTER, Role.EDITOR]}
          onSelectRole={setInvitationRole}
          ariaLabel={t('Invite new members')}
        />
        <Button
          onClick={() => void onInvite()}
          disabled={isLoading || !canShare}
          aria-label={inviteLabel}
          data-testid="doc-share-invite-button"
          size={isSmallMobile ? 'small' : 'medium'}
        >
          {t('Invite')}
        </Button>
      </Box>
    </Card>
  );
};
