import type { CreateAssignmentInput } from '@aptly/contracts';
import { recorderName } from './presentation';

const photos: Record<CreateAssignmentInput['model'], string> = {
  notepins: '/devices/notepins.png',
  notepro: '/devices/notepro.png',
};
export function RecorderPhoto({ model }: { model: CreateAssignmentInput['model'] }) {
  return (
    <img
      className="recorder-photo"
      src={photos[model]}
      alt={recorderName(model)}
      width={160}
      height={160}
    />
  );
}
