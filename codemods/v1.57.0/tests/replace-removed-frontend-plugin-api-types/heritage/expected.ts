import { ProgressProps, ExtensionAttachTo, Extension } from '@backstage/frontend-plugin-api';
interface First { label: string }
interface Second extends Before, After { label: string }
class Third implements Other { }
interface Attach extends ExtensionAttachTo { extra: boolean }
type Attachment = Extension<unknown>['attachTo'];
interface Commented extends Before, /* keep */ ProgressProps {}
