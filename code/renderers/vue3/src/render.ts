import { dedent } from 'ts-dedent';
import { createApp, h, reactive } from 'vue';
import type { RenderContext, ArgsStoryFn } from '@storybook/types';

import type { Args, StoryContext } from '@storybook/csf';
import type { StoryFnVueReturnType, VueRenderer } from './types';

export const render: ArgsStoryFn<VueRenderer> = (props, context) => {
  const { id, component: Component } = context;
  if (!Component) {
    throw new Error(
      `Unable to render story ${id} as the component annotation is missing from the default export`
    );
  }

  return h(Component, props, getSlots(props, context));
};

let setupFunction = (_app: any) => {};
export const setup = (fn: (app: any) => void) => {
  setupFunction = fn;
};

const map = new Map<string, { vueApp: ReturnType<typeof createApp>; reactiveArgs: any }>();

export function renderToCanvas(
  {
    storyFn,
    name,
    showMain,
    showError,
    showException,
    id,
    title,
    forceRemount,
    storyContext,
  }: RenderContext<VueRenderer>,
  canvasElement: VueRenderer['canvasElement']
) {
  // TODO: explain cyclical nature of these app => story => mount
  const element: StoryFnVueReturnType = storyFn();

  if (!element) {
    showError({
      title: `Expecting a Vue component from the story: "${name}" of "${title}".`,
      description: dedent`
      Did you forget to return the Vue component from the story?
      Use "() => ({ template: '<my-comp></my-comp>' })" or "() => ({ components: MyComp, template: '<my-comp></my-comp>' })" when defining the story.
      `,
    });
    return;
  }
  const { args: storyArgs, viewMode } = storyContext;

  const storyID = `${id}--${viewMode}`;
  const existingApp = map.get(storyID);
  console.log('---------- storyID ', storyID, ' name', name);

  if (existingApp && !forceRemount) {
    updateArgs(existingApp.reactiveArgs, storyArgs);
    return;
  }

  clearVueApps(viewMode, id);

  const reactiveArgs = storyArgs ? reactive(storyArgs) : storyArgs;

  const storybookApp = createApp({
    render() {
      map.set(storyID, { vueApp: storybookApp, reactiveArgs });
      return h(element, reactiveArgs);
    },
  });

  storybookApp.config.errorHandler = (e: unknown) => showException(e as Error);
  setupFunction(storybookApp);
  storybookApp.mount(canvasElement);

  showMain();
}

/**
 * get the slots as functions to be rendered
 * @param props
 * @param context
 */

function getSlots(props: Args, context: StoryContext<VueRenderer, Args>) {
  const { argTypes } = context;
  const slots = Object.entries(props)
    .filter(([key, value]) => argTypes[key]?.table?.category === 'slots')
    .map(([key, value]) => [key, () => h('span', JSON.stringify(value))]);

  return Object.fromEntries(slots);
}

/**
 *  update the reactive args
 * @param reactiveArgs
 * @param nextArgs
 * @returns
 */
function updateArgs(reactiveArgs: Args, nextArgs: Args) {
  if (!nextArgs) return;
  // use spread operator to merge new args with the existing args
  Object.assign(reactiveArgs, nextArgs);
}
/**
 * clear vue apps
 * @param viewMode
 * @param id
 * @returns
 */

function clearVueApps(viewMode: string, id: string) {
  const [idPrefix, idSuffix] = id.split('--');
  // console.log(' map to start clearing ', map);
  console.log('map start looping ---------------  size ', map.size);
  map.forEach((value, key) => {
    const [keyPrefix, keySuffix, keyViewMode] = key.split('--');
    console.log('key ', key);
    if (
      keyViewMode !== viewMode ||
      idPrefix !== keyPrefix ||
      (idSuffix !== keySuffix && viewMode !== 'docs')
    ) {
      console.log('unmounting - ', key);
      value.vueApp.unmount();
      map.delete(key);
    }
  });
}
