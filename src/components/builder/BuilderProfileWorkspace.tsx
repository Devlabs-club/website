import React from 'react';
import {
  profileGridClass,
  profileIdentityColumnClass,
  profileProofColumnClass,
  profileWorkspaceClass,
} from './builderProfileLayout';

export function BuilderProfileWorkspace({
  proof,
  identity,
}: {
  proof: React.ReactNode;
  identity: React.ReactNode;
}) {
  return (
    <div className={profileWorkspaceClass}>
      <div className={profileGridClass}>
        <div className={profileProofColumnClass}>{proof}</div>
        <div className={profileIdentityColumnClass}>{identity}</div>
      </div>
    </div>
  );
}
