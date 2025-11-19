import React from 'react';

export const Svg = ({ children, ...props }: any) => React.createElement('svg', props, children);
export const Path = (props: any) => React.createElement('path', props);
export const G = ({ children, ...props }: any) => React.createElement('g', props, children);

export default {
  Svg,
  Path,
  G,
};
