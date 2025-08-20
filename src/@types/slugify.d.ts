declare module 'slugify' {
  function slugify(input: string, options?: {
    lower?: boolean;
    strict?: boolean;
    [key: string]: any;
  }): string;
  export = slugify;
}
