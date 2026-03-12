declare module '*?worker&inline' {
  const WorkerFactory: {
    new (): Worker;
  };
  export default WorkerFactory;
}

declare module '*?url&inline' {
  const assetUrl: string;
  export default assetUrl;
}
