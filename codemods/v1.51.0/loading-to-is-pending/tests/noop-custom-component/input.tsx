const CustomButton = ({ loading }: { loading?: boolean }) => <button disabled={loading}>Save</button>;

export const Example = () => <CustomButton loading={isSubmitting} />;
