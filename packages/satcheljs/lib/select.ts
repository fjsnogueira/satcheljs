import {Reaction, Atom, IObservableValue, isObservableArray, isObservable} from 'mobx';
import {getOriginalTarget} from './functionInternals';

export interface SelectorFunction {
    [key: string]: (...args: any[]) => any;
}

function createCursorFromSelector(selector: SelectorFunction, args?: any) {
    let state: any = {};
    let reaction = new Reaction('__SELECT__', null);

    Object.keys(selector).forEach(key => {
        if (typeof state[key] === typeof undefined) {
            if (args && args.length > 0) {
                reaction.track(() => selector[key].apply(null, args));
            } else {
                reaction.track(selector[key]);
            }

            let observable = reaction.observing[reaction.observing.length - 1];

            if ((<any>observable).get) {
                let value: IObservableValue<any> = <any>observable;

                Object.defineProperty(state, key, {
                    enumerable: true,
                    get: value.get.bind(observable),
                    set: value.set.bind(observable)
                });
            } else if (observable instanceof Atom) {
                let parent: any[] = reaction.observing.length > 2 && <any>reaction.observing[reaction.observing.length - 2];
                if (parent && isObservableArray(parent)) {
                    // Handle the case where this is an element of an array
                    let atom: Atom = observable;
                    let index = parent.indexOf(atom);

                    Object.defineProperty(state, key, {
                        enumerable: true,
                        get: () => selector[key].apply(null, args),
                        set: (value) => parent[index] = value
                    });
                } else {
                    // If not an array, then all we can provide is a getter
                    Object.defineProperty(state, key, {
                        enumerable: true,
                        get: () => selector[key].apply(null, args)
                    });
                }
            } else {
                // If this is not an observable, then just create a getter
                Object.defineProperty(state, key, {
                    enumerable: true,
                    get: () => selector[key].apply(null, args)
                });
            }
        }
    });

    reaction.dispose();

    return state;
}

/**
 * Decorator for action functions. Selects a subset from the state tree for the action.
 */
export default function select(selector: SelectorFunction) {
    return function decorator<T extends Function>(target: T): T {
        let _this = this;
        let argumentPosition = target.length - 1;
        let actionTarget = getOriginalTarget(target);

        if (actionTarget) {
            argumentPosition = actionTarget.length - 1;            
        }
        
        let returnValue: any = function() {
            let state = createCursorFromSelector(selector, arguments);
            let args = Array.prototype.slice.call(arguments);
            if (typeof args[argumentPosition] === typeof undefined) {
                for (var i = args.length; i < argumentPosition; i++) {
                    args[i] = undefined;
                }
                args[argumentPosition] = state;
            }

            return target.apply(_this, args);
        }

        return <T>returnValue;
    }
}