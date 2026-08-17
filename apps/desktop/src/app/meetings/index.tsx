import * as React from 'react'
import { useParams } from 'react-router'

import type { GatewayRequester } from '@/app/contrib/types'
import { useI18n } from '@/i18n'

import { MeetingRoom } from './meeting-room'
import { NewMeetingDialog } from './new-meeting-dialog'

/** `/meetings` 与 `/meetings/:meetingId` 共用的挂载点（contrib/surfaces 路由）。 */
export function MeetingsView({ requestGateway }: { requestGateway: GatewayRequester }) {
  const { t } = useI18n()
  const { meetingId } = useParams<{ meetingId?: string }>()

  return (
    <div className="h-full min-h-0 overflow-hidden text-foreground">
      {meetingId ? (
        <MeetingRoom key={meetingId} meetingId={meetingId} requestGateway={requestGateway} />
      ) : (
        <div className="grid h-full place-items-center p-8">
          <p className="max-w-xs text-center text-xs text-(--ui-text-tertiary)">{t.meetings.emptyHint}</p>
        </div>
      )}
      <NewMeetingDialog requestGateway={requestGateway} />
    </div>
  )
}
