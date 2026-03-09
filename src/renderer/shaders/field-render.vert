#version 300 es
precision highp float;

// Full-screen quad vertex shader
in vec2 aPosition;

out vec2 vUV;

void main() {
  // Convert position from [-1, 1] to [0, 1] UV space
  vUV = aPosition * 0.5 + 0.5;
  
  // Output position
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
