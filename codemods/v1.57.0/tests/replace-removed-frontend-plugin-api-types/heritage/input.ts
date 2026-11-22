import { ProgressProps, ExtensionAttachTo } from '@backstage/frontend-plugin-api';
interface First extends ProgressProps { label: string }
interface Second extends Before, ProgressProps, After { label: string }
class Third implements ProgressProps, Other { }
interface Attach extends ExtensionAttachTo { extra: boolean }
type Attachment = ExtensionAttachTo;
interface Commented extends Before, /* keep */ ProgressProps {}
