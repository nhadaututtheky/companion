// Allow importing plain CSS files (e.g. from @xterm/xterm)
declare module "*.css" {
  const styles: Record<string, string>;
  export default styles;
}
