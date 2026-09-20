import { cb } from '../ai/actions';
import type { ComicPage } from '../types/comic';
import PromptField from './PromptField';

interface Props {
  page: ComicPage;
  pageIndex: number;
}

/** What you can say about the whole page: its prompt (intent). Shown whether or not a panel is highlighted. */
export default function PageDetails({ page, pageIndex }: Props) {
  return (
    <div className="p-3 pb-0">
      <div className="fw-semibold d-none d-md-block mb-2">Page {page.number}</div>
      <PromptField
        id="page-prompt"
        label="Page prompt"
        placeholder="What happens on this page, its mood and pacing"
        help="The intent of the whole page. It comes first in the prompt for every image on it."
        value={page.prompt ?? ''}
        onChange={(prompt) => cb().page.update({ prompt }, pageIndex)}
      />
    </div>
  );
}
