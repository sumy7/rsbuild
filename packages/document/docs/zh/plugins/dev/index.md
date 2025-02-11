# 插件系统

Rsbuild 提供了一套轻量强大的插件系统，用以实现自身的大多数功能，并允许用户进行扩展。

开发者编写的插件能够修改 Rsbuild 的默认行为，并添加各类额外功能，包括但不限于：

- 获取上下文信息
- 注册生命周期钩子
- 修改 Rspack 配置
- 修改 Rsbuild 配置
- ...

## 对比其他插件

在开发 Rsbuild 插件之前，你可能已经接触过 Webpack、Vite、esbuild 等工具的插件系统。

总体而言，Rsbuild 的插件 API 和 esbuild 相似，与 Webpack / Rspack 插件相比，Rsbuild 的插件 API 更加简洁和容易上手。

```ts
// esbuild plugin
const esbuildPlugin = {
  name: 'example',
  setup(build) {
    build.onEnd(() => console.log('done'));
  },
};

// Rsbuild plugin
const rsbuildPlugin = () => ({
  name: 'example',
  setup(api) {
    api.onAfterBuild(() => console.log('done'));
  },
});

// Rspack plugin
class RspackExamplePlugin {
  apply(compiler) {
    compiler.hooks.done.tap('RspackExamplePlugin', () => {
      console.log('done');
    });
  }
}
```

从功能上看，Rsbuild 的插件 API 主要围绕 Rsbuild 的运行流程和构建配置，并提供一些 hooks 用于扩展。而 Rspack 的插件 API 则更加复杂和丰富，能够修改打包过程的每一个环节。

Rsbuild 插件中可以集成 Rspack 插件，如果 Rsbuild 提供的 hooks 无法满足你的需求，你也可以通过 Rspack 插件来实现功能，并在 Rsbuild 插件中注册 Rspack 插件：

```ts
const rsbuildPlugin = () => ({
  name: 'example',
  setup(api) {
    api.modifyRspackConfig((config) => {
      config.plugins.push(new RspackExamplePlugin());
    });
  },
});
```

## 开发插件

插件提供类似 `(options?: PluginOptions) => RsbuildPlugin` 的函数作为入口。

### 插件示例

```ts title="pluginFoo.ts"
import type { RsbuildPlugin } from '@rsbuild/core';

export type PluginFooOptions = {
  message?: string;
};

export const pluginFoo = (options: PluginFooOptions = {}): RsbuildPlugin => ({
  name: 'plugin-foo',

  setup(api) {
    api.onAfterStartDevServer(() => {
      const msg = options.message || 'hello!';
      console.log(msg);
    });
  },
});
```

注册插件：

```ts title="rsbuild.config.ts"
import { pluginFoo } from './pluginFoo';

export default {
  plugins: [pluginFoo({ message: 'world!' })],
};
```

### 插件结构

函数形式的插件可以 **接受选项对象** 并 **返回插件实例**，并通过闭包机制管理内部状态。

其中各部分的作用分别为：

- `name` 属性用于标注插件名称。
- `setup` 作为插件逻辑的主入口。
- `api` 对象包含了各类钩子和工具函数。

### 命名规范

插件的命名规范如下：

- 插件的函数命名为 `pluginXXX`，并通过具名导出。
- 插件的 `name` 采用 `scope:foo-bar` 或 `plugin-foo-bar` 格式，添加 `scope:` 可以避免和其他插件产生命名冲突。

下面是一个例子：

```ts title="pluginFooBar.ts"
import type { RsbuildPlugin } from '@rsbuild/core';

export const pluginFooBar = (): RsbuildPlugin => ({
  name: 'xxx:foo-bar',
  setup() {},
});
```

:::tip
Rsbuild 官方插件的 `name` 统一使用 `rsbuild:` 作为前缀，比如 `rsbuild:react` 对应 `@rsbuild/plugin-react`。
:::

### 模板仓库

[rsbuild-plugin-template](https://github.com/rspack-contrib/rsbuild-plugin-template) 是一个最小的 Rsbuild 插件模板仓库，你可以基于该仓库来开发你的 Rsbuild 插件。

## 生命周期钩子

Rsbuild 在内部按照约定的生命周期进行任务调度，插件可以通过注册钩子来介入工作流程的任意阶段，并实现自己的功能。

Rsbuild 生命周期钩子的完整列表参考 [API 文档](/plugins/dev/hooks)。

Rsbuild 不会接管底层 Rspack 的生命周期，相关生命周期钩子的使用方式见对应文档：[Rspack Plugin API](https://rspack.dev/api/plugin-api)。

## 使用配置项

自行编写的插件通常使用初始化时传入函数的参数作为配置项即可，开发者可以随意定义和使用函数的入参。

但某些情况下插件可能需要读取 / 修改 Rsbuild 公用的配置项，这时就需要了解 Rsbuild 内部对配置项的生产和消费流程：

- 读取、解析配置并合并默认值
- 插件通过 `api.modifyRsbuildConfig(...)` 回调修改配置项
- 归一化配置项并提供给插件后续消费，此后无法再修改配置项

整套流程可以通过这个简单的插件体现：

```ts
export const pluginUploadDist = (): RsbuildPlugin => ({
  name: 'plugin-upload-dist',
  setup(api) {
    api.modifyRsbuildConfig((config) => {
      // 尝试关闭代码压缩，需要自己填充默认值
      config.output ||= {};
      config.output.disableMinimize = true;
      // 轮到其它插件修改配置...
    });
    api.onBeforeBuild(() => {
      // 读取最终的配置
      const config = api.getNormalizedConfig();
      if (!config.output.disableMinimize) {
        // 其它插件又启用了压缩则报错
        throw new Error(
          'You must disable minimize to upload readable dist files.',
        );
      }
    });
    api.onAfterBuild(() => {
      const config = api.getNormalizedConfig();
      const distRoot = config.output.distPath.root;

      // 上传 `distRoot` 目录下所有产物文件...
    });
  },
});
```

插件中有三种方式使用配置项对象：

- `api.modifyRsbuildConfig(config => {})` 在回调中修改配置
- `api.getRsbuildConfig()` 获取配置项
- `api.getNormalizedConfig()` 获取归一化后的配置项

归一化的配置项会再次合并默认值，并移除大部分可选类型，对于 `PluginUploadDist` 的例子，其部分类型定义为：

```ts
api.modifyRsbuildConfig((config: RsbuildConfig) => {});
api.getRsbuildConfig() as RsbuildConfig;
type RsbuildConfig = {
  output?: {
    disableMinimize?: boolean;
    distPath?: { root?: string };
  };
};

api.getNormalizedConfig() as NormalizedConfig;
type NormalizedConfig = {
  output: {
    disableMinimize: boolean;
    distPath: { root: string };
  };
};
```

`getNormalizedConfig()` 的返回值类型与 `RsbuildConfig` 的略有不同、相比文档其它地方描述的类型进行了收窄，
在使用时无需自行判空、填充默认值。

因此使用配置项的最佳方式应该是：

- 通过 `api.modifyRsbuildConfig(config => {})` 来**修改配置**
- 在其后的生命周期中读取 `api.getNormalizedConfig()` 作为插件**实际使用的配置**

## 修改 Rspack 配置

Rsbuild 插件可以通过多种方式修改 Rspack 的配置项。

- `api.modifyRspackConfig(config => {})` 修改最终的 Rspack 配置。
- `api.modifyBundlerChain(chain => {})` 修改 `bundler-chain`，用法与 [webpack-chain](https://github.com/neutrinojs/webpack-chain) 相同。
- `api.onAfterCreateCompiler(compiler => {})` 直接操作 Rspack 的 compiler 实例。

## 参考范例

### 修改 Loader

Loader 可以读取和处理不同类型的文件模块，具体参考 [concepts](https://webpack.js.org/concepts/loaders) 和 [loaders](https://webpack.js.org/loaders/)。

```ts
import type { RsbuildPlugin } from '@rsbuild/core';

export const pluginTypeScriptExt = (): RsbuildPlugin => ({
  name: 'plugin-typescript-ext',
  setup(api) {
    api.modifyBundlerChain(async (chain) => {
      // 设置 ts-loader 将更多的文件识别为 typescript 模块
      chain.module.rule(CHAIN_ID.RULE.TS).test(/\.(?:ts|mts|cts|tsx|tss|tsm)$/);
    });
  },
});
```

### 添加模块入口

```ts
import type { RsbuildPlugin } from '@rsbuild/core';

export const pluginAdminPanel = (): RsbuildPlugin => ({
  name: 'plugin-admin-panel',
  setup(api) {
    api.modifyBundlerChain(async (chain) => {
      config.entry('admin-panel').add('src/admin/panel.js');
    });
  },
});
```

### 注册 Rspack 插件

你可以在 Rsbuild 插件中注册 Rspack 插件，比如注册 `eslint-webpack-plugin`：

```ts
import type { RsbuildPlugin } from '@rsbuild/core';
import ESLintPlugin from 'eslint-webpack-plugin';

export const pluginEslint = (options?: Options): RsbuildPlugin => ({
  name: 'plugin-eslint',
  setup(api) {
    // Use bundler-chain to register a bundler plugin.
    api.modifyBundlerChain(async (chain) => {
      chain.plugin('eslint-webpack-plugin').use(ESLintPlugin, [
        {
          // plugins options
        },
      ]);
    });
  },
});
```
