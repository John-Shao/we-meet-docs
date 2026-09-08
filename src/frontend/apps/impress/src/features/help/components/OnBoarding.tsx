import {
  ModalSize,
  OnboardingModal,
  type OnboardingModalProps,
  OnboardingStep,
} from '@gouvfr-lasuite/ui-kit';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfig } from '@/core/config/api/useConfig';

import { useOnboardingSteps } from '../hooks/useOnboardingSteps';

/**
 * typing was not correct on ui-kit side for the description prop of OnboardingStep,
 * it can be a string or a ReactNode but was typed as string only, so we need to override the
 * type here to be able to use ReactNode
 */
type OnboardingStepFixed = Omit<OnboardingStep, 'description'> & {
  description?: ReactNode;
};

type OnboardingModalPropsFixed = Omit<OnboardingModalProps, 'steps'> & {
  steps?: OnboardingStepFixed[];
};

const OnboardingModalFixed =
  OnboardingModal as React.ComponentType<OnboardingModalPropsFixed>;

type OnBoardingProps = {
  isOpen: boolean;
  onClose: () => void;
} & Partial<OnboardingModalProps>;

export const OnBoarding = (props: OnBoardingProps) => {
  const { t } = useTranslation();
  const { steps } = useOnboardingSteps();
  const { data: config } = useConfig();
  const learnMoreUrl =
    config?.theme_customization?.onboarding?.learn_more_url?.trim();

  return (
    <>
      <OnboardingModalFixed
        size={ModalSize.LARGE}
        appName={t('Discover Docs')}
        mainTitle={t('Learn the core principles')}
        steps={steps}
        footerLink={
          learnMoreUrl
            ? {
                label: t('Learn more docs features'),
                href: learnMoreUrl,
              }
            : undefined
        }
        onSkip={props.onClose}
        onComplete={props.onClose}
        {...props}
      />
    </>
  );
};
