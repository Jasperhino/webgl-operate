
import { assert } from './auxiliaries';

import { Subject } from 'rxjs/Subject';


/**
 * Decorator that is intended to make protected member variables observable using rxjs subjects. For it, the actual
 * member variable is replaced by getters and setters (thus also made public, for now) in order to capture value
 * changes. In addition, a rxjs subject is associated to the member variable and made available via  getter as well.
 * If the subject is requested at least once, it is created and subsequent value changes are passed to the subject
 * for observation. If required, an additional public getter (without the protected members'_' prefix) will be created.
 * Also, instead of the value, a tuple of the value and the object instance can be passed for observation (optional).
 *
 * Observation of protected member variables is intended for public API use only, e.g., communication of value changes
 * to UX or external components, and should NOT be used internally (webgl-operate uses explicit function invocation
 * instead of asynchronous, event-driven invocation).
 *
 * ```
 * class SomeObject {
 *     @observable<string>(false, true)
 *     protected _member: string;
 * }
 * ```
 * The example above will allow for the following:
 * ```
 * const object = new SomeObject();
 * object.memberSubject.subscribe(value => console.log('member value of some object changed:' + value));
 * object.member = 'some value'; // will log 'member value of some object changed: some value' to console
 * ```
 *
 * @param getter - Whether or not a public getter should be generated. Note that this is created at run-time.
 * @param reference - Whether or a tuple of value and object instance is observed instead of the value only.
 */
export function observable<T>(getter: boolean = false, reference: boolean = false) {
    return (target: any, key: string) => {

        /**
         * Used to redirect the decorated property to this internal value.
         */
        let _value: T;

        /**
         * Subject for observation of value changes of the decorated property. If reference is true, instead of the
         * plain value, a tuple of the value and the target is provided to the subject.
         */
        let _subject: Subject<T> | Subject<[T, typeof target]>;

        /**
         * Invokes the subject's next method, specialized for subject with and without a reference.
         */
        const next = reference ? () => (_subject as Subject<[T, typeof target]>).next([_value, target]) :
            () => (_subject as Subject<T>).next(_value);

        /**
         * This decorator is assumed to be applied to protected member variables exclusively. Since the decorator
         * captures value changes by swapping the actual member variable with a setter, a getter is required for read.
         * This getter will also be used if a public getter is to be decorated (getter === true).
         */
        const valueGetter = (): T => _value;

        /**
         * This decorator is assumed to be applied to protected member variables exclusively. This setter captures
         * value changes by swapping the actual member variable (that is deleted) with this setter.
         * @param value - New value to be set to the internal value store.
         */
        const valueSetter = (value: T) => {
            _value = value;
            if (_subject) {
                next();
            }
        };

        /**
         * The target will be decorated by this subject getter. Note that not subject is created as long as this getter
         * is called at least once in order to reduce memory footprint caused by rxjs subjects.
         */
        const subjectGetter = () => {
            if (_subject === undefined) {
                _subject = reference ? new Subject<[T, typeof target]>() : new Subject<T>();
                next();
            }
            return _subject;
        };

        assert(key.startsWith('_'), `expected key to start with '_' | given ${key}`);

        /* Capture the actual member variable by replacing it with getters and setters of this decorator. */
        delete this[key];
        Object.defineProperty(target, key, { get: valueGetter, set: valueSetter });

        /* Create an optional (public) getter to the member variable. */
        if (getter) {
            Object.defineProperty(target, key.substr(1), { get: valueGetter });
        }

        /* Create a subject getter/accessor for the protected member variable (assumed to be prefixed with '_'). */
        Object.defineProperty(target, key.substr(1) + 'Subject', { get: subjectGetter });

    };
}
