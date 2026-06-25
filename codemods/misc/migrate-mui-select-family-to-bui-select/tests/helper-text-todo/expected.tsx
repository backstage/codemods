





const MyComponent = () => (
  {/* TODO(backstage-codemod): finish Select migration manually */}
<FormControl>
    <InputLabel>Color</InputLabel>
    <Select value={color} onChange={e => setColor(e.target.value as string)}>
      <MenuItem value="red">Red</MenuItem>
      <MenuItem value="blue">Blue</MenuItem>
    </Select>
    <FormHelperText>Pick a color</FormHelperText>
  </FormControl>
);
