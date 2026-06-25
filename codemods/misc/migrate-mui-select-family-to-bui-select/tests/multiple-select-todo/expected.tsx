




const MyComponent = () => (
  {/* TODO(backstage-codemod): finish Select migration manually */}
<FormControl>
    <InputLabel>Tags</InputLabel>
    <Select multiple value={tags} onChange={handleChange}>
      <MenuItem value="a">A</MenuItem>
      <MenuItem value="b">B</MenuItem>
    </Select>
  </FormControl>
);
