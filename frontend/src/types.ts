import type { ReservationProjection } from '../../src/reservations/projection';
import type { Resource } from './components/ReservationForm';
export interface Workspace {
  id: string;
  userId: string;
  kind: 'demo' | 'normal';
  visitorId: string | null;
  expiresAt: string | null;
}
export interface Auth {
  workspace: Workspace | null;
  demoEnabled: boolean;
  loginEnabled: boolean;
}
export interface Availability {
  resource: Resource;
  date: string;
  timeZone: string;
  serverNow: string;
  reservations: Array<
    Pick<
      ReservationProjection,
      'id' | 'resourceId' | 'startsAt' | 'endsAt' | 'purpose' | 'status' | 'version'
    >
  >;
}
